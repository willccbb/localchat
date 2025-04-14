// Placeholder for Tauri commands exposed to frontend 

use crate::models::{Conversation, Message, ModelConfig};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;
#[allow(unused_imports)]
use crate::api::{LLMApiProvider, OpenAICompatibleProvider}; // Import API provider
use crate::config; // Import config module for API key retrieval
#[allow(unused_imports)]
use std::sync::Arc; // To hold the API provider
use tauri::Emitter; // For app_handle.emit
use futures::StreamExt; // Added for stream processing

// Tauri command to list all conversations
#[tauri::command]
pub async fn list_conversations(state: State<'_, AppState>) -> Result<Vec<Conversation>, String> {
    log::info!("Frontend requested to list conversations");
    let storage_manager = state.storage.lock().await; // Lock the mutex to access StorageManager
    match storage_manager.list_conversations().await {
        Ok(conversations) => Ok(conversations),
        Err(e) => {
            log::error!("Failed to list conversations: {:?}", e);
            // Convert the detailed error into a user-friendly string for the frontend
            Err(format!("Failed to load conversations: {}", e))
        }
    }
}

// Tauri command to create a new conversation
#[tauri::command]
pub async fn create_conversation(state: State<'_, AppState>) -> Result<Conversation, String> {
    log::info!("Frontend requested to create a new conversation");
    let storage_manager = state.storage.lock().await;
    match storage_manager.create_conversation().await {
        Ok(conversation) => Ok(conversation),
        Err(e) => {
            log::error!("Failed to create conversation: {:?}", e);
            Err(format!("Failed to create conversation: {}", e))
        }
    }
}

// Tauri command to get messages for a specific conversation
#[tauri::command]
pub async fn get_conversation_messages(
    state: State<'_, AppState>,
    conversation_id: String, // Receive ID as String from frontend
) -> Result<Vec<Message>, String> {
    log::info!("Frontend requested messages for conversation ID: {}", conversation_id);
    
    // Parse the UUID from the string
    let Ok(conv_uuid) = Uuid::parse_str(&conversation_id) else {
        let err_msg = format!("Invalid conversation ID format: {}", conversation_id);
        log::error!("{}", err_msg);
        return Err(err_msg);
    };

    let storage_manager = state.storage.lock().await;
    match storage_manager.get_conversation_messages(conv_uuid).await {
        Ok(messages) => Ok(messages),
        Err(e) => {
            log::error!("Failed to get messages for conversation {}: {:?}", conversation_id, e);
            Err(format!("Failed to load messages: {}", e))
        }
    }
}

// Tauri command to delete a conversation
#[tauri::command]
pub async fn delete_conversation(state: State<'_, AppState>, conversation_id: String) -> Result<(), String> {
    log::warn!("Frontend requested to delete conversation ID: {}", conversation_id);
    
    let Ok(conv_uuid) = Uuid::parse_str(&conversation_id) else {
        let err_msg = format!("Invalid conversation ID format for delete: {}", conversation_id);
        log::error!("{}", err_msg);
        return Err(err_msg);
    };

    let storage_manager = state.storage.lock().await;
    match storage_manager.delete_conversation(conv_uuid).await {
        Ok(_) => Ok(()),
        Err(e) => {
            log::error!("Failed to delete conversation {}: {:?}", conversation_id, e);
            Err(format!("Failed to delete conversation: {}", e))
        }
    }
}

// Helper function to get ModelConfig from storage
async fn get_model_config(
    storage_manager: &crate::storage::StorageManager,
    config_id: Uuid,
) -> Result<ModelConfig, String> {
    // Need to add a method to StorageManager to get a single config by ID
    // For now, we'll fetch all and filter - replace later
    storage_manager.list_model_configs().await // Assuming list_model_configs exists
        .map_err(|e| format!("Failed to fetch model configs: {}", e))?
        .into_iter()
        .find(|mc| mc.id == config_id)
        .ok_or_else(|| format!("Model config with ID {} not found", config_id))
}

// Tauri command to send a message (NOW includes API call and event emit)
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> Result<Message, String> { // Still returns the user message initially
    log::info!("Frontend requested to send message to conversation ID: {}", conversation_id);
    
    let Ok(conv_uuid) = Uuid::parse_str(&conversation_id) else {
        let err_msg = format!("Invalid conversation ID format for send: {}", conversation_id);
        log::error!("{}", err_msg);
        return Err(err_msg);
    };

    let user_message = Message {
        id: Uuid::new_v4(),
        conversation_id: conv_uuid,
        role: "user".to_string(),
        content,
        timestamp: Utc::now(),
        metadata: None,
    };
    
    let user_message_clone = user_message.clone();

    // --- Save user message --- 
    let storage = state.storage.lock().await;
    if let Err(e) = storage.save_message(&user_message).await {
        log::error!("Failed to save user message for conversation {}: {:?}", conversation_id, e);
        return Err(format!("Failed to save message: {}", e));
    }
    log::info!("User message {} saved.", user_message.id);
    drop(storage);

    // --- Trigger API call in background --- 
    let app_state_clone = state.inner().clone();
    let conversation_id_clone = conversation_id.clone();

    tauri::async_runtime::spawn(async move {
        log::info!("Background task started for conversation {}", conversation_id_clone);
        let storage = app_state_clone.storage.lock().await;
        
        // 1. Get conversation history
        let messages_result = storage.get_conversation_messages(conv_uuid).await;
        let messages = match messages_result {
            Ok(m) => m,
            Err(e) => {
                log::error!("BG Task: Failed to get messages for {}: {:?}", conversation_id_clone, e);
                return; // Exit task
            }
        };

        // 2. Get ModelConfig for this conversation
        let conversation_result = storage.get_conversation(conv_uuid).await; // Assuming get_conversation exists
        let conversation = match conversation_result {
            Ok(Some(c)) => c,
            Ok(None) => {
                 log::error!("BG Task: Conversation {} not found", conversation_id_clone);
                 return;
            }
            Err(e) => {
                 log::error!("BG Task: Failed to get conversation {}: {:?}", conversation_id_clone, e);
                 return;
            }
        };
        let model_config_result = get_model_config(&storage, conversation.model_config_id).await;
        let model_config = match model_config_result {
            Ok(mc) => mc,
            Err(e) => {
                log::error!("BG Task: Failed to get model config for {}: {}", conversation_id_clone, e);
                return;
            }
        };

        // --- Create System Prompt --- 
        let system_prompt_content = format!("You are {}.", model_config.name);
        let system_prompt = Message {
            // Generate a temporary ID or use a convention if needed, API usually ignores system ID
            id: Uuid::nil(), // Or Uuid::new_v4() if the API provider might use it
            conversation_id: conv_uuid, // Associate with the current conversation
            role: "system".to_string(),
            content: system_prompt_content,
            timestamp: Utc::now(), // Or use conversation creation time?
            metadata: None, 
        };

        // --- Get API Key --- 
        let api_key_result = config::get_api_key(&model_config);
        let api_key = match api_key_result {
            Ok(key) => key,
            Err(e) => {
                 log::error!("BG Task: Failed to get API key for {}: {:?}", conversation_id_clone, e);
                 // TODO: Emit an event to frontend to show error
                 return;
            }
        };
        
        // --- Prepare messages for API (including system prompt) --- 
        let mut api_messages = vec![system_prompt];
        api_messages.extend(messages.iter().cloned()); // Clone messages from history

        // --- Get API Provider --- 
        let api_provider = app_state_clone.api_provider.clone(); 

        // --- Make the API call (Streaming) --- 
        log::info!("BG Task: Starting stream request for conversation {}", conversation_id_clone);
        let delta_stream_result = api_provider
            .send_chat_stream_request(&model_config, &api_key, &api_messages) // Use stream request
            .await;

        let mut delta_stream = match delta_stream_result {
            Ok(stream) => stream,
            Err(e) => {
                log::error!("BG Task: Failed to initiate stream request for {}: {:?}", conversation_id_clone, e);
                // TODO: Emit an error event to frontend
                return;
            }
        };
        
        // --- Process Stream and Emit Chunks --- 
        let mut full_content = String::new();
        let assistant_message_id = Uuid::new_v4(); // Generate ID upfront
        let mut first_chunk = true;

        while let Some(delta_result) = delta_stream.next().await {
            match delta_result {
                Ok(delta_content) => {
                    full_content.push_str(&delta_content);
                    
                    // Emit the chunk to the frontend
                    let chunk_payload = serde_json::json!({
                        "conversationId": conversation_id_clone,
                        "messageId": assistant_message_id.to_string(),
                        "delta": delta_content,
                        "isFirstChunk": first_chunk, // Indicate if it's the start
                    });
                    if let Err(e) = app_state_clone.app_handle.emit("assistant_message_chunk", &chunk_payload) {
                        log::error!("Failed to emit assistant_message_chunk event: {:?}", e);
                        // Decide if we should break or continue
                    }
                    first_chunk = false; // No longer the first chunk
                }
                Err(e) => {
                     log::error!("BG Task: Error receiving stream delta for {}: {:?}", conversation_id_clone, e);
                     // TODO: Emit an error event to frontend?
                     // Depending on the error, might want to break the loop
                     break;
                }
            }
        }
        log::info!("BG Task: Stream finished for conversation {}", conversation_id_clone);

        // --- Save the completed assistant message --- 
        if !full_content.is_empty() {
            let assistant_message = Message {
                id: assistant_message_id,
                conversation_id: conv_uuid,
                role: "assistant".to_string(),
                content: full_content,
                timestamp: Utc::now(), 
                metadata: None, // TODO: Could potentially get usage stats somehow if API provides it at the end?
            };

            if let Err(e) = storage.save_message(&assistant_message).await {
                 log::error!("BG Task: Failed to save completed assistant message {} for {}: {:?}", assistant_message_id, conversation_id_clone, e);
            } else {
                 log::info!("BG Task: Completed assistant message {} saved for {}", assistant_message_id, conversation_id_clone);
            }
        } else {
            log::warn!("BG Task: Stream finished for {} but received no content.", conversation_id_clone);
        }

        // Optionally emit a "done" event if needed by frontend
        // app_state_clone.app_handle.emit("assistant_stream_done", ...)?; 

    }); // End of async_runtime::spawn

    // Return the user message immediately for optimistic update
    Ok(user_message_clone)
}

// Tauri command to rename a conversation
#[tauri::command]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
    new_title: String,
) -> Result<(), String> {
    log::info!(
        "Frontend requested to rename conversation {} to: {}",
        conversation_id,
        new_title
    );

    if new_title.trim().is_empty() {
        return Err("New title cannot be empty.".to_string());
    }
    
    let Ok(conv_uuid) = Uuid::parse_str(&conversation_id) else {
        let err_msg = format!("Invalid conversation ID format for rename: {}", conversation_id);
        log::error!("{}", err_msg);
        return Err(err_msg);
    };

    let storage_manager = state.storage.lock().await;
    match storage_manager
        .rename_conversation(conv_uuid, new_title.trim().to_string())
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => {
            log::error!("Failed to rename conversation {}: {:?}", conversation_id, e);
            Err(format!("Failed to rename conversation: {}", e))
        }
    }
}

// Tauri command to update a conversation's model
#[tauri::command]
pub async fn update_conversation_model(
    state: State<'_, AppState>,
    conversation_id: String, // ID of conversation to update
    model_config_id: String, // ID of the new model config
) -> Result<(), String> {
    log::info!(
        "Frontend requested to update model for conversation {} to model {}",
        conversation_id,
        model_config_id
    );
    
    let Ok(conv_uuid) = Uuid::parse_str(&conversation_id) else {
        return Err(format!("Invalid conversation ID format: {}", conversation_id));
    };
    let Ok(model_uuid) = Uuid::parse_str(&model_config_id) else {
        return Err(format!("Invalid model config ID format: {}", model_config_id));
    };
    
    let storage = state.storage.lock().await;
    // Need an update_conversation_model_id method in StorageManager
    match storage.update_conversation_model_id(conv_uuid, model_uuid).await { // Call new storage method
        Ok(_) => Ok(()),
        Err(e) => {
            log::error!("Failed to update model for conversation {}: {:?}", conversation_id, e);
            Err(format!("Failed to update conversation model: {}", e))
        }
    }
}

// --- Model Config Commands ---

#[tauri::command]
pub async fn list_model_configs(state: State<'_, AppState>) -> Result<Vec<ModelConfig>, String> {
    log::info!("Frontend requested to list model configs");
    let storage = state.storage.lock().await;
    storage.list_model_configs().await
        .map_err(|e| format!("Failed to list model configs: {}", e))
}

#[tauri::command]
pub async fn add_model_config(state: State<'_, AppState>, config: ModelConfig) -> Result<(), String> {
    log::info!("Frontend requested to add model config: {}", config.name);
    // Basic validation (can add more)
    if config.name.trim().is_empty() || config.api_url.trim().is_empty() || config.provider.trim().is_empty() {
        return Err("Name, API URL, and Provider cannot be empty.".to_string());
    }
    // The `config` object received already has a default ID generated by serde.
    // Remove the redundant creation of `config_with_id`
    // let config_with_id = ModelConfig { id: Uuid::new_v4(), ..config };

    let storage = state.storage.lock().await;
    // Use the received `config` directly
    storage.add_model_config(&config).await
        .map_err(|e| format!("Failed to add model config: {}", e))
}

#[tauri::command]
pub async fn update_model_config(state: State<'_, AppState>, config: ModelConfig) -> Result<(), String> {
    log::info!("Frontend requested to update model config: {}", config.id);
    // Basic validation
    if config.name.trim().is_empty() || config.api_url.trim().is_empty() || config.provider.trim().is_empty() {
        return Err("Name, API URL, and Provider cannot be empty.".to_string());
    }

    let storage = state.storage.lock().await;
    storage.update_model_config(&config).await
        .map_err(|e| format!("Failed to update model config: {}", e))
}

#[tauri::command]
pub async fn delete_model_config(state: State<'_, AppState>, config_id: String) -> Result<(), String> {
    log::warn!("Frontend requested to delete model config ID: {}", config_id);
    
    let Ok(uuid) = Uuid::parse_str(&config_id) else {
        return Err(format!("Invalid model config ID format: {}", config_id));
    };

    let storage = state.storage.lock().await;
    storage.delete_model_config(uuid).await
        .map_err(|e| format!("Failed to delete model config: {}", e))
}

// TODO: Commands for getting/setting API keys via keyring

// Add other commands later (create_conversation, get_messages, etc.) 