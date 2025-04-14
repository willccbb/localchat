// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Declare the modules
pub mod api;
pub mod commands;
pub mod config;
pub mod models;
pub mod state;
pub mod storage;

use state::AppState;
use storage::StorageManager;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt; // Import the correct trait
use commands::{list_conversations, create_conversation, get_conversation_messages, delete_conversation, send_message, rename_conversation, list_model_configs, add_model_config, update_model_config, delete_model_config, update_conversation_model, stop_generation}; // Import commands
use crate::api::LLMApiProvider;
use crate::api::OpenAICompatibleProvider; // Import specific provider
use std::sync::Arc;

#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    // Use the open_url method provided by the plugin via the trait
    match app.opener().open_url(url.as_str(), None::<String>) {
        Ok(_) => Ok(()),
        Err(err) => Err(format!("Failed to open URL: {}", err.to_string())),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            // Initialize the StorageManager and create the AppState
            // We block here because setup is synchronous, but StorageManager::new is async.
            // This is generally okay for one-time setup.
            let app_handle = app.handle().clone();
            let storage_manager = tauri::async_runtime::block_on(
                async { StorageManager::new(&app_handle).await }
            )?;

            // Add default model config if none exist
            tauri::async_runtime::block_on(
                async { storage_manager.add_default_model_config_if_none().await }
            )?;

            // Create the API provider instance
            let api_provider: Arc<dyn LLMApiProvider> = Arc::new(OpenAICompatibleProvider::new());

            // Pass AppHandle to AppState
            let app_state = AppState::new(storage_manager, api_provider, app_handle.clone());

            // Add the AppState to Tauri's managed state
            app.manage(app_state);

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Register the command(s) with the handler
        .invoke_handler(tauri::generate_handler![
            list_conversations,
            create_conversation,
            get_conversation_messages,
            delete_conversation,
            send_message,
            rename_conversation,
            update_conversation_model,
            list_model_configs,
            add_model_config,
            update_model_config,
            delete_model_config,
            open_url,
            stop_generation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
