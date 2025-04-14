use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Represents a single message in a conversation
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    #[serde(default = "Uuid::new_v4")] // Generate a new UUID if missing during deserialization
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: String, // "user" or "assistant" - consider an enum later
    pub content: String,
    #[serde(default = "Utc::now")]
    pub timestamp: DateTime<Utc>,
    // Optional metadata (e.g., model used, tokens, cost) - stored as JSON string in DB
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
}

// Represents the metadata for a conversation thread
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Conversation {
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    pub title: String, // e.g., "Chat about Rust" (potentially auto-generated)
    #[serde(default = "Utc::now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "Utc::now")]
    pub last_updated_at: DateTime<Utc>,
    pub model_config_id: Uuid, // Link to the model config used
}

// Represents a configured API endpoint/model
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModelConfig {
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    pub name: String, // User-friendly name (e.g., "OpenAI GPT-4o Mini")
    pub provider: String, // e.g., "openai_compatible" - consider an enum later
    pub api_url: String, // Base URL
    // Store reference to key, not the key itself - e.g., 'keyring' or 'env:MY_API_KEY' or null
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_ref: Option<String>,
    // Store other provider-specific config as JSON string?
    // e.g., default model string ('gpt-4o-mini'), temperature, etc.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_options: Option<String>,
} 