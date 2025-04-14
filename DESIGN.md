# Local LLM Chat App - Design Document

## 1. Overview

This document outlines the design for the local LLM chat application, building upon the decisions made in `PLANNING.md`.

*   **Goal:** A type-safe, performant, and extensible macOS desktop chat application for interacting with various LLM APIs.
*   **Stack:**
    *   **Core Logic:** Rust
    *   **Desktop Wrapper:** Tauri
    *   **Frontend UI:** TypeScript with a web framework (e.g., React, Vue, or Svelte - decision deferred to initial setup, React/TS assumed for examples).
*   **Initial Focus:** Support for OpenAI-compatible APIs, with extensibility for other providers.

## 2. Architecture

The application follows a standard Tauri architecture:

```
+-----------------------+      +-----------------+      +----------------------+ 
| Frontend (TS/React)   | <--> | Tauri IPC       | <--> | Rust Backend         |
| (Webview)             |      | (`invoke`, etc) |      | (Core Logic)         |
|                       |      +-----------------+      |                      |
| - UI Components       |                               | - State Management   |
| - User Input Handling |                               | - API Client(s)      |
| - State Sync          |                               | - Storage (SQLite)   |
| - Calls to Backend    |                               | - Config Management  |
+-----------------------+                               +----------------------+
```

*   **Frontend:** Renders the UI within a system webview, manages UI state, and interacts with the backend via asynchronous calls (`tauri::invoke`).
*   **Rust Backend:** Handles all core logic, including state management, interaction with external APIs, data persistence, and configuration. Exposes specific functions (`#[tauri::command]`) to be called from the frontend.
*   **Tauri:** Provides the bridge between the frontend and backend, manages the application window, and offers APIs for native OS interactions (though minimally used initially).

## 3. Rust Backend Design (`src-tauri`)

The Rust backend will be structured into logical modules.

### 3.1 Core Modules

*   `main.rs`: Entry point, sets up Tauri application, initializes state and database.
*   `state.rs`: Defines and manages the core application state (shared across threads).
*   `api.rs`: Handles interactions with external LLM APIs.
*   `storage.rs`: Manages data persistence using SQLite.
*   `config.rs`: Handles loading and saving application settings and API configurations.
*   `models.rs`: Defines core data structures (`Conversation`, `Message`, etc.) used across modules.
*   `commands.rs`: Contains all functions exposed to the frontend via `#[tauri::command]`.

### 3.2 State Management (`state.rs`)

*   A central `AppState` struct will hold the application's runtime state.
*   This state will be managed by Tauri (`tauri::State<T>`) and likely wrapped in thread-safe containers like `tokio::sync::Mutex` or `std::sync::Mutex` for fields that need modification (e.g., list of conversations, current API client).
*   Example `AppState` structure:

    ```rust
    // models.rs
    #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
    pub struct Message {
        pub id: String, // Unique ID (e.g., UUID)
        pub conversation_id: String,
        pub role: String, // "user" or "assistant"
        pub content: String,
        pub timestamp: i64, // Unix timestamp
        // Optional: metadata like model used, cost, tokens, etc.
    }

    #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
    pub struct Conversation {
        pub id: String, // Unique ID (e.g., UUID)
        pub title: String, // e.g., "Chat about Rust" (potentially auto-generated)
        pub created_at: i64,
        pub last_updated_at: i64,
        pub model_config_id: String, // Link to the model config used
        // Messages loaded on demand or stored separately
    }
    
    // config.rs
    #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
    pub struct ModelConfig {
       pub id: String, // Unique ID
       pub name: String, // User-friendly name (e.g., "OpenAI GPT-4o Mini")
       pub provider: String, // e.g., "openai_compatible"
       pub api_url: String, // Base URL
       pub api_key_env_var: Option<String>, // Optional: Env var name for the key
       // Add provider-specific params later (model name string, temperature defaults, etc.)
    }
    

    // state.rs
    use tokio::sync::Mutex;
    use std::collections::HashMap;
    use crate::{models::{Conversation, ModelConfig}, storage::StorageManager}; // Assuming storage manager access

    pub struct AppState {
        pub storage: Mutex<StorageManager>, // Handle to storage
        pub conversations: Mutex<Vec<Conversation>>, // List of loaded conversations (metadata only)
        pub active_models: Mutex<Vec<ModelConfig>>, // Available model configurations
        // Potentially cache active conversation messages here if needed
    }

    impl AppState {
        // Methods to initialize, load conversations, etc.
    }
    ```

### 3.3 API Client Module (`api.rs`)

*   Define a generic `LLMApiProvider` trait.
*   Implement an initial `OpenAICompatibleProvider` struct that conforms to the trait.
*   Use `reqwest` for making asynchronous HTTP calls.
*   Use `serde` and `serde_json` for request/response serialization/deserialization.
*   Handle API key retrieval (potentially via the `config` module).
*   Support streaming responses using `reqwest::Response::bytes_stream` and yield chunks back to the frontend via Tauri events.

    ```rust
    // api.rs
    use async_trait::async_trait;
    use crate::models::{Message, ModelConfig};

    #[async_trait]
    pub trait LLMApiProvider {
        async fn send_chat_request(
            &self,
            config: &ModelConfig,
            api_key: &str,
            messages: &[Message],
            // Potentially add streaming callback/channel
        ) -> Result<Message, anyhow::Error>; // Return the assistant's message

        // Optional: Add a streaming version
        // async fn send_chat_request_stream(...) -> Result<Stream<...>, Error>;
    }

    pub struct OpenAICompatibleProvider;

    #[async_trait]
    impl LLMApiProvider for OpenAICompatibleProvider {
        async fn send_chat_request(
             &self,
             config: &ModelConfig,
             api_key: &str,
             messages: &[Message],
        ) -> Result<Message, anyhow::Error> {
             // Implementation using reqwest to call config.api_url
             // Map internal Message format to provider's format
             // ...
             Ok(Message { /* ... assistant response ... */ })
        }
    }
    ```

### 3.4 Storage Module (`storage.rs`)

*   Use SQLite via the `sqlx` crate for asynchronous database access.
*   Define database schema (see Section 7).
*   Implement `StorageManager` struct with async methods for:
    *   Initializing the database (`setup`).
    *   CRUD operations for `conversations`.
    *   CRUD operations for `messages` (associated with conversations).
    *   CRUD operations for `model_configs`.
    *   CRUD operations for `settings`.
*   Store the database file in the appropriate application data directory provided by Tauri (`app_local_data_dir`).

### 3.5 Configuration Module (`config.rs`)

*   Load/Save `ModelConfig` structs (likely stored in the SQLite DB).
*   Load/Save general application settings (e.g., theme, default model) - also in DB.
*   Handle API Keys:
    *   **Crucially, API keys should NOT be stored directly in the config file or database in plain text.**
    *   Option 1: Store keys in environment variables and reference the env var name in `ModelConfig`. The Rust backend reads the env var at runtime.
    *   Option 2 (Better): Use the `keyring` crate to store API keys securely in the OS keychain/credential manager. Associate the key with a service name (e.g., `localchat-{config.id}`). `ModelConfig` would then just store the `id`.

### 3.6 Commands Module (`commands.rs`)

*   Exposes backend functionality to the frontend.
*   Examples:
    *   `#[tauri::command] async fn list_conversations(state: tauri::State<'_, AppState>) -> Result<Vec<Conversation>, String>`
    *   `#[tauri::command] async fn get_conversation_messages(state: tauri::State<'_, AppState>, conversation_id: String) -> Result<Vec<Message>, String>`
    *   `#[tauri::command] async fn send_message(state: tauri::State<'_, AppState>, conversation_id: String, message_content: String) -> Result<(), String>` (Triggers API call, results likely sent via events for streaming)
    *   `#[tauri::command] async fn regenerate_message(...)`
    *   `#[tauri::command] async fn edit_message(...)`
    *   `#[tauri::command] async fn create_conversation(...)`
    *   `#[tauri::command] async fn delete_conversation(...)`
    *   `#[tauri::command] async fn list_model_configs(state: tauri::State<'_, AppState>) -> Result<Vec<ModelConfig>, String>`
    *   `#[tauri::command] async fn save_model_config(...)`
    *   `#[tauri::command] async fn get_api_key(config_id: String) -> Result<Option<String>, String>` // Uses keyring
    *   `#[tauri::command] async fn set_api_key(config_id: String, key: String) -> Result<(), String>` // Uses keyring

## 4. Frontend Design (Example: React + TypeScript)

*   **UI Library:** A component library like Shadcn/ui, Material UI, or Mantine for pre-built, styled components.
*   **Core Components:**
    *   `App.tsx`: Main application layout.
    *   `Sidebar.tsx`: Lists conversations, allows creating new chats, links to settings.
    *   `ChatView.tsx`: Displays messages for the active conversation.
    *   `MessageBubble.tsx`: Renders a single user or assistant message, including edit/regenerate buttons.
    *   `MessageInput.tsx`: Text area for user input, send button, potentially model selector dropdown.
    *   `SettingsView.tsx`: UI for managing `ModelConfig` entries (adding/editing URLs, associating keys) and other app settings.
*   **State Management:**
    *   Use a dedicated state management library (Zustand, Redux Toolkit) or React Context API for managing global UI state (e.g., list of conversations, active conversation ID, loaded messages for active chat, available models).
    *   Fetch initial state (conversations, models) from the Rust backend on startup using `invoke`.
*   **Backend Communication:**
    *   Use `@tauri-apps/api/tauri`'s `invoke` function to call Rust commands.
    *   Use `@tauri-apps/api/event`'s `listen` function to subscribe to events sent from Rust (e.g., for streaming API responses, state updates initiated by the backend).

## 5. Data Structures (TypeScript Interfaces)

Define TypeScript interfaces corresponding to the Rust structs in `models.rs` for type safety in the frontend.

```typescript
// src/types.ts
interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number; // Represented as number (milliseconds since epoch)
}

interface Conversation {
  id: string;
  title: string;
  created_at: number;
  last_updated_at: number;
  model_config_id: string;
}

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  api_key_env_var?: string; // Or indicate if keyring is used
}

interface AppSettings {
    // e.g., theme: 'light' | 'dark';
    default_model_config_id?: string;
}
```

## 6. API Interaction Flow (Example: Sending a message)

1.  **FE:** User types message in `MessageInput` and clicks Send.
2.  **FE:** `MessageInput` component calls a function (e.g., `sendMessageHandler`).
3.  **FE:** `sendMessageHandler` gets current `conversation_id`, `message_content`, and the currently selected `model_config_id`. It optimistically adds the user message to the local UI state.
4.  **FE:** Calls `invoke('send_message_to_provider', { conversationId, messageContent, modelConfigId })`.
5.  **BE:** `send_message_to_provider` command receives the request.
6.  **BE:** Retrieves the full conversation history (messages) from `storage` for the `conversationId`.
7.  **BE:** Retrieves the `ModelConfig` and associated API key (from `keyring` or env var) using `modelConfigId`.
8.  **BE:** Selects the appropriate `LLMApiProvider` based on `config.provider`.
9.  **BE:** Calls `provider.send_chat_request(...)` (or the streaming equivalent).
10. **BE (Streaming):** As chunks arrive from the API:
    *   Emits a Tauri event (e.g., `chat-chunk`) with `{ conversationId, chunkContent }`.
11. **FE:** An event listener (`listen('chat-chunk', ...)` in `ChatView`?) receives chunks and appends them to the assistant message being displayed.
12. **BE (Non-streaming or end-of-stream):** Receives the final assistant message.
13. **BE:** Saves the new user message and the complete assistant message to `storage`.
14. **BE:** Updates the `last_updated_at` timestamp for the conversation in `storage`.
15. **BE:** Potentially emits a final event (`chat-complete`) or the initial `invoke` call resolves.
16. **FE:** Updates the final assistant message state.

## 7. Storage Schema (SQLite via `sqlx`)

```sql
-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL, -- UUID
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL, -- Unix Timestamp (seconds)
    last_updated_at INTEGER NOT NULL, -- Unix Timestamp (seconds)
    model_config_id TEXT NOT NULL -- FK (implicitly) to model_configs
    -- Add other metadata later if needed
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL, -- UUID
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL, -- Unix Timestamp (seconds)
    -- Optional metadata JSON blob? e.g., model used, tokens, cost
    metadata TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);


-- Model Configurations Table
CREATE TABLE IF NOT EXISTS model_configs (
    id TEXT PRIMARY KEY NOT NULL, -- UUID
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL, -- e.g., 'openai_compatible'
    api_url TEXT NOT NULL,
    -- Store reference to key, not the key itself
    api_key_ref TEXT, -- e.g., 'keyring' or 'env:MY_API_KEY' or null
    -- Store other config as JSON? e.g., default model string ('gpt-4o-mini')
    provider_options TEXT -- JSON blob
);

-- Application Settings Table (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
-- Example rows: ('theme', 'dark'), ('default_model_id', 'uuid-of-default-model')
```

## 8. Error Handling

*   **Rust Backend:** Use `Result<T, E>` extensively. Define custom error types (`anyhow::Error` or specific enums) that can be serialized and sent to the frontend. Tauri commands should return `Result<T, String>` where the `String` is a user-friendly error message or a serialized error object. Log detailed errors on the backend.
*   **Frontend:** Wrap `invoke` calls in `try...catch` blocks. Display user-friendly error messages based on the errors received from the backend (e.g., using toast notifications).

## 9. Future Considerations

*   **API Trait:** The `LLMApiProvider` trait allows adding new providers (Anthropic, local Ollama, etc.) by implementing the trait and potentially adjusting `ModelConfig`.
*   **Storage:** SQLite supports indexing, making future history search feasible. Storing messages separately allows lazy loading.
*   **Branching:** Could be implemented by adding a `parent_message_id` to the `messages` table, allowing multiple messages to follow a single parent. UI needs significant changes.
*   **Agents/Tools:** Requires significant architectural additions, likely involving separate async tasks managed by the Rust backend and more complex state management.

## 10. Build & Development

*   **Rust:** `cargo` for building, testing, dependency management.
*   **Frontend:** `pnpm` (or `npm`/`yarn`) for managing JS dependencies.
*   **Tauri:** Tauri CLI (`cargo tauri dev`, `cargo tauri build`) for running the development server and building the final application.
*   **Database Schema Checks:** Uses `sqlx::query!` macro for compile-time SQL checks. Requires `sqlx-cli` to be installed (`cargo install sqlx-cli --no-default-features --features native-tls,sqlite`). Before compiling Rust code after adding or changing SQL queries in `src-tauri/src/storage.rs`, run `cargo sqlx prepare` within the `src-tauri` directory (providing the `DATABASE_URL` environment variable if the `.sqlx` cache doesn't exist yet, e.g., `DATABASE_URL="sqlite://$HOME/Library/Application Support/com.localchat.app/localchat.sqlite?mode=rwc" cargo sqlx prepare`). The generated `.sqlx` directory should be committed to version control. 