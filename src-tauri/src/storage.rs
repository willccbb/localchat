use anyhow::Context;
use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Sqlite, SqlitePool};
use tauri::AppHandle;
use tauri::Manager;
use crate::models::Conversation;
use uuid::Uuid;
use chrono::{Utc};
use crate::models::Message;
use crate::models::ModelConfig;

// Define the database schema using CREATE TABLE IF NOT EXISTS statements
const MIGRATIONS_SQL: &str = "
-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL, -- UUID
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL, -- Unix Timestamp (seconds)
    last_updated_at INTEGER NOT NULL, -- Unix Timestamp (seconds)
    model_config_id TEXT NOT NULL -- FK (implicitly) to model_configs
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL, -- UUID
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL, -- Unix Timestamp (seconds)
    metadata TEXT, -- Optional JSON blob
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
    api_key_ref TEXT, -- e.g., 'keyring', 'env:MY_API_KEY', or null
    provider_options TEXT -- JSON blob for provider-specific settings
);

-- Application Settings Table (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
";

#[derive(Debug)]
pub struct StorageManager {
    pool: SqlitePool,
}

impl StorageManager {
    /// Creates a new StorageManager, connects to the database, and runs migrations.
    pub async fn new(app_handle: &AppHandle) -> Result<Self, anyhow::Error> {
        let db_path = app_handle
            .path()
            .resolve("localchat.sqlite", tauri::path::BaseDirectory::AppLocalData)
            .context("Failed to resolve database path")?;
        
        // Ensure the parent directory exists
        if let Some(parent) = db_path.parent() {
            tokio::fs::create_dir_all(parent).await.context("Failed to create database directory")?;
        }

        let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
        log::info!("Connecting to database: {}", db_url);

        // Create the database file if it doesn't exist
        if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
            log::info!("Database file not found, creating...");
            Sqlite::create_database(&db_url).await.context("Failed to create database")?;
        }

        // Connect to the database
        let pool = SqlitePoolOptions::new()
            .connect(&db_url)
            .await
            .context("Failed to connect to SQLite database")?;

        // Run migrations
        Self::run_migrations(&pool).await?;

        Ok(Self { pool })
    }

    /// Applies the database schema migrations.
    async fn run_migrations(pool: &SqlitePool) -> Result<(), anyhow::Error> {
        log::info!("Running database migrations...");
        // In a real app, use sqlx::migrate! macro with migration files.
        // For simplicity here, we execute the combined SQL string.
        sqlx::query(MIGRATIONS_SQL)
            .execute(pool)
            .await
            .context("Failed to run database migrations")?;
        log::info!("Database migrations completed.");
        Ok(())
    }

    /// Fetches all conversations, ordered by last updated descending.
    pub async fn list_conversations(&self) -> Result<Vec<Conversation>, anyhow::Error> {
        log::debug!("Fetching all conversations from database");
        // Note: sqlx requires mapping the row to the struct.
        // Timestamps are stored as INTEGER (Unix seconds) but need to be converted to DateTime<Utc>.
        // UUIDs are stored as TEXT but need to be parsed.
        let rows = sqlx::query!(
            r#"
            SELECT id, title, created_at, last_updated_at, model_config_id
            FROM conversations
            ORDER BY last_updated_at DESC
            "#
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch conversations from database")?;

        // Manually map rows to Conversation structs
        let conversations = rows
            .into_iter()
            .map(|row| {
                Ok(Conversation {
                    id: uuid::Uuid::parse_str(&row.id).context("Failed to parse conversation ID")?,
                    title: row.title,
                    created_at: chrono::DateTime::from_timestamp(row.created_at, 0)
                        .context("Invalid created_at timestamp")?,
                    last_updated_at: chrono::DateTime::from_timestamp(row.last_updated_at, 0)
                        .context("Invalid last_updated_at timestamp")?,
                    model_config_id: uuid::Uuid::parse_str(&row.model_config_id)
                        .context("Failed to parse model_config_id")?,
                })
            })
            .collect::<Result<Vec<Conversation>, anyhow::Error>>()?;

        log::info!("Fetched {} conversations", conversations.len());
        Ok(conversations)
    }

    /// Fetches the ID of the first model config found in the database.
    async fn get_first_model_config_id(&self) -> Result<Uuid, anyhow::Error> {
        log::debug!("Fetching first model config ID");
        let row = sqlx::query!("SELECT id FROM model_configs LIMIT 1")
            .fetch_optional(&self.pool)
            .await
            .context("Failed to query for first model config")?;

        match row {
            Some(data) => Uuid::parse_str(&data.id).context("Failed to parse model config ID"),
            None => Err(anyhow::anyhow!("No model configurations found in the database. Please configure at least one model.")),
        }
    }

    /// Creates a new conversation with a default title and the first available model config.
    pub async fn create_conversation(&self) -> Result<Conversation, anyhow::Error> {
        log::info!("Creating new conversation");
        let default_model_id = self.get_first_model_config_id().await?;
        
        let new_conversation = Conversation {
            id: Uuid::new_v4(),
            title: "New Chat".to_string(), // Default title
            created_at: Utc::now(),
            last_updated_at: Utc::now(),
            model_config_id: default_model_id,
        };

        // Convert Uuid and DateTime to types storable in SQLite (TEXT and INTEGER)
        let id_text = new_conversation.id.to_string();
        let model_config_id_text = new_conversation.model_config_id.to_string();
        let created_at_ts = new_conversation.created_at.timestamp();
        let last_updated_at_ts = new_conversation.last_updated_at.timestamp();

        sqlx::query!(
            r#"
            INSERT INTO conversations (id, title, created_at, last_updated_at, model_config_id)
            VALUES (?, ?, ?, ?, ?)
            "#,
            id_text,
            new_conversation.title,
            created_at_ts,
            last_updated_at_ts,
            model_config_id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to insert new conversation into database")?;

        log::info!("Successfully created conversation with ID: {}", new_conversation.id);
        Ok(new_conversation)
    }

    /// Adds a default OpenAI-compatible model config if no configs exist.
    pub async fn add_default_model_config_if_none(&self) -> Result<(), anyhow::Error> {
        log::debug!("Checking for existing model configurations");
        let count_result = sqlx::query!("SELECT COUNT(*) as count FROM model_configs")
            .fetch_one(&self.pool)
            .await
            .context("Failed to count model configs")?;
        
        if count_result.count == 0 {
            log::info!("No model configs found, adding a default OpenAI config.");
            let default_id = Uuid::new_v4();
            let id_text = default_id.to_string();
            let name = "Default OpenAI Compatible".to_string();
            let provider = "openai_compatible".to_string();
            // Use OpenAI's official endpoint as a placeholder
            let api_url = "https://api.openai.com/v1".to_string(); 
            // Indicate that the key should be fetched from the environment variable OPENAI_API_KEY
            let api_key_ref = Some("env:OPENAI_API_KEY".to_string()); 
            let provider_options = Some("{\"model\": \"gpt-4o-mini\"}".to_string()); // Example options

            sqlx::query!(
                r#"
                INSERT INTO model_configs (id, name, provider, api_url, api_key_ref, provider_options)
                VALUES (?, ?, ?, ?, ?, ?)
                "#,
                id_text,
                name,
                provider,
                api_url,
                api_key_ref,
                provider_options
            )
            .execute(&self.pool)
            .await
            .context("Failed to insert default model config")?;
            log::info!("Default model config added with ID: {}", default_id);
        } else {
            log::debug!("Found {} existing model configs, skipping default.", count_result.count);
        }
        Ok(())
    }

    /// Fetches all messages for a given conversation, ordered by timestamp ascending.
    pub async fn get_conversation_messages(
        &self,
        conversation_id: Uuid,
    ) -> Result<Vec<Message>, anyhow::Error> {
        log::debug!("Fetching messages for conversation ID: {}", conversation_id);
        let conversation_id_text = conversation_id.to_string();

        let rows = sqlx::query!(
            r#"
            SELECT id, conversation_id, role, content, timestamp, metadata
            FROM messages
            WHERE conversation_id = ?
            ORDER BY timestamp ASC
            "#,
            conversation_id_text
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch messages from database")?;

        // Manually map rows to Message structs
        let messages = rows
            .into_iter()
            .map(|row| {
                Ok(Message {
                    id: uuid::Uuid::parse_str(&row.id).context("Failed to parse message ID")?,
                    conversation_id: uuid::Uuid::parse_str(&row.conversation_id)
                        .context("Failed to parse conversation ID for message")?,
                    role: row.role,
                    content: row.content,
                    timestamp: chrono::DateTime::from_timestamp(row.timestamp, 0)
                        .context("Invalid message timestamp")?,
                    metadata: row.metadata,
                })
            })
            .collect::<Result<Vec<Message>, anyhow::Error>>()?;

        log::info!("Fetched {} messages for conversation {}", messages.len(), conversation_id);
        Ok(messages)
    }

    /// Deletes a conversation and its associated messages.
    pub async fn delete_conversation(&self, conversation_id: Uuid) -> Result<(), anyhow::Error> {
        let conversation_id_text = conversation_id.to_string();
        log::warn!("Deleting conversation with ID: {}", conversation_id_text);

        // Because of `ON DELETE CASCADE` on the messages table's foreign key,
        // deleting the conversation should automatically delete its messages.
        let result = sqlx::query!(
            "DELETE FROM conversations WHERE id = ?",
            conversation_id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to delete conversation from database")?;

        if result.rows_affected() == 0 {
            log::warn!("Attempted to delete non-existent conversation: {}", conversation_id);
            // Consider returning an error or just logging
        }

        log::info!("Successfully deleted conversation {}", conversation_id);
        Ok(())
    }

    /// Saves a single message to the database.
    pub async fn save_message(&self, message: &Message) -> Result<(), anyhow::Error> {
        log::debug!("Saving message ID: {} to conversation: {}", message.id, message.conversation_id);
        
        let id_text = message.id.to_string();
        let conversation_id_text = message.conversation_id.to_string();
        let timestamp_ts = message.timestamp.timestamp();

        sqlx::query!(
            r#"
            INSERT INTO messages (id, conversation_id, role, content, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
            id_text,
            conversation_id_text,
            message.role,
            message.content,
            timestamp_ts,
            message.metadata // Already Option<String>
        )
        .execute(&self.pool)
        .await
        .context("Failed to insert message into database")?;

        // Also update the conversation's last_updated_at timestamp
        let update_conv_ts = Utc::now().timestamp();
        sqlx::query!(
            "UPDATE conversations SET last_updated_at = ? WHERE id = ?",
            update_conv_ts,
            conversation_id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to update conversation last_updated_at timestamp")?;
        
        log::info!("Successfully saved message ID: {}", message.id);
        Ok(())
    }

    /// Renames a conversation.
    pub async fn rename_conversation(
        &self,
        conversation_id: Uuid,
        new_title: String,
    ) -> Result<(), anyhow::Error> {
        let conversation_id_text = conversation_id.to_string();
        log::info!(
            "Renaming conversation {} to: {}",
            conversation_id_text,
            new_title
        );

        let update_conv_ts = Utc::now().timestamp();

        let result = sqlx::query!(
            "UPDATE conversations SET title = ?, last_updated_at = ? WHERE id = ?",
            new_title,
            update_conv_ts,
            conversation_id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to update conversation title in database")?;

        if result.rows_affected() == 0 {
            log::warn!(
                "Attempted to rename non-existent conversation: {}",
                conversation_id
            );
            // Consider returning an error or just logging
            return Err(anyhow::anyhow!("Conversation not found for renaming."));
        }

        log::info!("Successfully renamed conversation {}", conversation_id);
        Ok(())
    }

    /// Fetches a single conversation by its ID.
    pub async fn get_conversation(&self, conversation_id: Uuid) -> Result<Option<Conversation>, anyhow::Error> {
        let conversation_id_text = conversation_id.to_string();
        log::debug!("Fetching conversation with ID: {}", conversation_id_text);

        let row = sqlx::query!(
            r#"
            SELECT id, title, created_at, last_updated_at, model_config_id
            FROM conversations
            WHERE id = ?
            "#,
            conversation_id_text
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch conversation from database")?;

        match row {
            Some(r) => {
                let conversation = Conversation {
                    id: uuid::Uuid::parse_str(&r.id).context("Failed to parse conversation ID")?,
                    title: r.title,
                    created_at: chrono::DateTime::from_timestamp(r.created_at, 0)
                        .context("Invalid created_at timestamp")?,
                    last_updated_at: chrono::DateTime::from_timestamp(r.last_updated_at, 0)
                        .context("Invalid last_updated_at timestamp")?,
                    model_config_id: uuid::Uuid::parse_str(&r.model_config_id)
                        .context("Failed to parse model_config_id")?,
                };
                Ok(Some(conversation))
            }
            None => Ok(None),
        }
    }

    /// Updates the model config ID for a specific conversation.
    pub async fn update_conversation_model_id(
        &self,
        conversation_id: Uuid,
        new_model_config_id: Uuid,
    ) -> Result<(), anyhow::Error> {
        let conversation_id_text = conversation_id.to_string();
        let model_id_text = new_model_config_id.to_string();
        let update_ts = Utc::now().timestamp();
        log::info!(
            "Updating model for conversation {} to {} in database",
            conversation_id_text,
            model_id_text
        );

        let result = sqlx::query!(
            r#"
            UPDATE conversations 
            SET model_config_id = ?, last_updated_at = ?
            WHERE id = ?
            "#,
            model_id_text,
            update_ts,
            conversation_id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to update conversation model ID in database")?;

        if result.rows_affected() == 0 {
            log::warn!("Attempted to update model for non-existent conversation: {}", conversation_id);
            // Consider returning an error or just logging
            // For now, let's return an error to be safe
            return Err(anyhow::anyhow!("Conversation with ID {} not found for model update", conversation_id));
        }

        log::info!("Successfully updated model for conversation {}", conversation_id);
        Ok(())
    }

    /// Fetches all model configurations.
    pub async fn list_model_configs(&self) -> Result<Vec<ModelConfig>, anyhow::Error> {
        log::debug!("Fetching all model configurations from database");

        let rows = sqlx::query!(
            r#"
            SELECT id, name, provider, api_url, api_key_ref, provider_options
            FROM model_configs
            ORDER BY name ASC
            "#
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch model configs from database")?;

        // Manually map rows to ModelConfig structs
        let configs = rows
            .into_iter()
            .map(|row| {
                Ok(ModelConfig {
                    id: uuid::Uuid::parse_str(&row.id).context("Failed to parse model config ID")?,
                    name: row.name,
                    provider: row.provider,
                    api_url: row.api_url,
                    api_key_ref: row.api_key_ref,
                    provider_options: row.provider_options,
                })
            })
            .collect::<Result<Vec<ModelConfig>, anyhow::Error>>()?;

        log::info!("Fetched {} model configurations", configs.len());
        Ok(configs)
    }

    /// Adds a new model configuration to the database.
    pub async fn add_model_config(&self, config: &ModelConfig) -> Result<(), anyhow::Error> {
        log::info!("Adding new model config: {}", config.name);
        let id_text = config.id.to_string();

        sqlx::query!(
            r#"
            INSERT INTO model_configs (id, name, provider, api_url, api_key_ref, provider_options)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
            id_text,
            config.name,
            config.provider,
            config.api_url,
            config.api_key_ref,
            config.provider_options
        )
        .execute(&self.pool)
        .await
        .context("Failed to insert new model config into database")?;

        log::info!("Successfully added model config with ID: {}", config.id);
        Ok(())
    }

    /// Updates an existing model configuration.
    pub async fn update_model_config(&self, config: &ModelConfig) -> Result<(), anyhow::Error> {
        let id_text = config.id.to_string();
        log::info!("Updating model config: {} ({})", config.name, id_text);

        let result = sqlx::query!(
            r#"
            UPDATE model_configs 
            SET name = ?, provider = ?, api_url = ?, api_key_ref = ?, provider_options = ?
            WHERE id = ?
            "#,
            config.name,
            config.provider,
            config.api_url,
            config.api_key_ref,
            config.provider_options,
            id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to update model config in database")?;

        if result.rows_affected() == 0 {
            log::warn!("Attempted to update non-existent model config: {}", id_text);
            return Err(anyhow::anyhow!("Model config not found for updating."));
        }

        log::info!("Successfully updated model config {}", id_text);
        Ok(())
    }

    /// Deletes a model configuration.
    /// Note: This does NOT currently prevent deleting a config that is in use by conversations.
    /// Consider adding checks or constraints later.
    pub async fn delete_model_config(&self, config_id: Uuid) -> Result<(), anyhow::Error> {
        let id_text = config_id.to_string();
        log::warn!("Deleting model config with ID: {}", id_text);

        let result = sqlx::query!("DELETE FROM model_configs WHERE id = ?", id_text)
            .execute(&self.pool)
            .await
            .context("Failed to delete model config from database")?;

        if result.rows_affected() == 0 {
            log::warn!("Attempted to delete non-existent model config: {}", id_text);
            // Don't error if not found, just log
        }

        log::info!("Successfully deleted model config {}", id_text);
        Ok(())
    }

    /// Updates an existing conversation.
    pub async fn update_conversation(&self, conv: &Conversation) -> Result<(), anyhow::Error> {
        let id_text = conv.id.to_string();
        log::info!("Updating conversation: {} ({})", conv.title, id_text);
        let model_config_id_text = conv.model_config_id.to_string();
        let last_updated_at_ts = Utc::now().timestamp(); // Always update timestamp on change

        let result = sqlx::query!(
            r#"
            UPDATE conversations 
            SET title = ?, last_updated_at = ?, model_config_id = ?
            WHERE id = ?
            "#,
            conv.title,
            last_updated_at_ts, // Use current timestamp
            model_config_id_text,
            id_text
        )
        .execute(&self.pool)
        .await
        .context("Failed to update conversation in database")?;

        if result.rows_affected() == 0 {
            log::warn!("Attempted to update non-existent conversation: {}", id_text);
            return Err(anyhow::anyhow!("Conversation not found for updating."));
        }

        log::info!("Successfully updated conversation {}", id_text);
        Ok(())
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool // Make the pool accessible if needed elsewhere (removes dead code warning for pool)
    }
} 