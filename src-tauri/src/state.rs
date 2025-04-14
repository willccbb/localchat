use crate::storage::StorageManager;
use crate::api::LLMApiProvider; // Import trait
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle; // For event emission

// Core application state accessible by Tauri commands
#[derive(Clone)] // Allow cloning for background tasks
pub struct AppState {
    // We wrap the StorageManager in a Mutex to allow safe concurrent access
    // from async Tauri commands.
    pub storage: Arc<Mutex<StorageManager>>, // Use Arc<Mutex<>> for shared ownership and mutation
    // We can add more fields here later, like loaded conversations metadata
    // pub conversations: Mutex<Vec<crate::models::Conversation>>,
    // pub active_models: Mutex<Vec<crate::models::ModelConfig>>,
    pub api_provider: Arc<dyn LLMApiProvider>, // Hold the trait object
    pub app_handle: AppHandle, // Store AppHandle for event emitting
}

impl AppState {
    // Constructor for AppState
    pub fn new(storage_manager: StorageManager, api_provider: Arc<dyn LLMApiProvider>, app_handle: AppHandle) -> Self {
        Self {
            storage: Arc::new(Mutex::new(storage_manager)),
            api_provider,
            app_handle,
        }
    }
} 