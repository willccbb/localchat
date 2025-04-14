use crate::models::{Message, ModelConfig};
use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use futures::{stream, Stream, StreamExt, TryStreamExt};
use eventsource_stream::Eventsource;
use std::pin::Pin;
use chrono::Utc;
use uuid::Uuid;

// Alias for the stream type we'll return
pub type DeltaStream = Pin<Box<dyn Stream<Item = Result<String>> + Send>>;

// Trait defining the interface for LLM API providers
#[async_trait]
pub trait LLMApiProvider: Send + Sync { 
    // Returns a stream of content deltas.
    async fn send_chat_stream_request(
        &self,
        config: &ModelConfig,
        api_key: &str,
        messages: &[Message], // Use internal Message struct
    ) -> Result<DeltaStream>; 
}

// --- OpenAI Compatible Provider Implementation ---

// Request Body now includes stream=true
#[derive(Serialize, Debug)]
struct OpenAIRequestBody {
    model: String, 
    messages: Vec<OpenAIMessage>,
    stream: bool, // Set to true
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct OpenAIMessage {
    role: String,
    content: String,
}

// Response structure for STREAMING chunks
#[derive(Deserialize, Debug)]
struct OpenAIStreamChunk {
    id: String,
    object: String,
    created: i64,
    model: String,
    choices: Vec<OpenAIStreamChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAIStreamChoice {
    index: u32,
    delta: OpenAIStreamDelta,
    finish_reason: Option<String>, // Nullable for stream
}

#[derive(Deserialize, Debug, Clone)] // Clone needed
struct OpenAIStreamDelta {
    // Role might appear in the first chunk
    role: Option<String>,
    // Content is the important part
    content: Option<String>,
}

pub struct OpenAICompatibleProvider {
    client: Client, 
}

impl OpenAICompatibleProvider {
    pub fn new() -> Self {
        Self { client: Client::new() }
    }

    fn get_model_name(&self, config: &ModelConfig) -> Result<String> {
        let options_json = config.provider_options.as_deref().unwrap_or("{}");
        let options: serde_json::Value = serde_json::from_str(options_json)
            .context("Failed to parse provider_options JSON")?;
        options["model"].as_str().map(|s| s.to_string())
            .context("Missing or invalid 'model' field in provider_options")
    }
}

#[async_trait]
impl LLMApiProvider for OpenAICompatibleProvider {
    // Implement the new streaming method
    async fn send_chat_stream_request(
        &self,
        config: &ModelConfig,
        api_key: &str,
        messages: &[Message],
    ) -> Result<DeltaStream> {
        let model_name = self.get_model_name(config)?;
        log::info!("Sending STREAM request to OpenAI compatible API: {} using model: {}", config.api_url, model_name);

        let api_messages: Vec<OpenAIMessage> = messages
            .iter()
            .map(|msg| OpenAIMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            })
            .collect();

        let request_body = OpenAIRequestBody {
            model: model_name,
            messages: api_messages,
            stream: true, // Enable streaming
        };

        let request_url = format!("{}/chat/completions", config.api_url.trim_end_matches('/'));

        let response = self.client
            .post(&request_url)
            .bearer_auth(api_key)
            .json(&request_body)
            .send()
            .await
            .context("Failed to send stream request to OpenAI API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_else(|_| "<Failed to read error body>".to_string());
            log::error!("OpenAI API stream request failed with status {}: {}", status, error_body);
            return Err(anyhow::anyhow!("API stream request failed with status {}: {}", status, error_body));
        }

        // Process the SSE stream
        let event_stream = response.bytes_stream().eventsource();

        let delta_stream = event_stream
            .map(|event_result| -> Result<Option<String>> { // Map Result<Event, _> to Result<Option<String>, _>
                let event = event_result.context("Error reading stream event")?;
                let event_data = event.data.trim();
                
                // Check for the special [DONE] message
                if event_data == "[DONE]" {
                    log::info!("Stream finished with [DONE]");
                    return Ok(None); // Signal end of content stream
                }

                // Attempt to parse the JSON data
                match serde_json::from_str::<OpenAIStreamChunk>(event_data) {
                    Ok(chunk) => {
                        // Successfully parsed a chunk, extract content
                        let delta_content = chunk.choices
                            .get(0)
                            .and_then(|choice| choice.delta.content.clone()); 
                        Ok(delta_content)
                    },
                    Err(e) => {
                        // Parsing as OpenAIStreamChunk failed.
                        // Try parsing as generic JSON to check for known event types like ping.
                        match serde_json::from_str::<serde_json::Value>(event_data) {
                            Ok(json_value) => {
                                if json_value.get("type") == Some(&serde_json::Value::String("ping".to_string())) {
                                    log::debug!("Received stream ping event, skipping.");
                                    Ok(None) // Skip ping
                                } else {
                                    // Parsed as JSON, but not a known type to ignore.
                                    log::warn!("Failed to parse stream chunk as OpenAIStreamChunk, but it was valid JSON: {} - Data: {}", e, event_data);
                                    Err(anyhow::Error::from(e).context(format!("Parsed as JSON but not a valid OpenAIStreamChunk: {}", event_data)))
                                }
                            }
                            Err(_) => {
                                // Failed to parse as generic JSON either. Propagate original OpenAIStreamChunk error.
                                log::warn!("Failed to parse stream chunk as JSON: {} - Data: {}", e, event_data);
                                Err(anyhow::Error::from(e).context(format!("Failed to parse stream chunk as JSON: {}", event_data)))
                            }
                        }
                    }
                }
            })
            .filter_map(|result| async move { // Filter out errors and None values, return only content strings
                match result {
                    Ok(Some(content)) => Some(Ok(content)), // Pass through the content string wrapped in Ok
                    Ok(None) => None, // Filter out the end-of-stream signal
                    Err(e) => {
                        log::error!("Error processing stream chunk: {:?}", e);
                        Some(Err(e)) // Pass through the error
                    }
                }
             });

        // Box the stream
        Ok(Box::pin(delta_stream))
    }
} 