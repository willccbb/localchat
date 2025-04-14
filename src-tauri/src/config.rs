use crate::models::ModelConfig;
use anyhow::{Context, Result};
use keyring::Entry;

// Placeholder for general application settings loading/saving
// pub fn load_settings() -> Result<AppSettings> { ... }
// pub fn save_settings(settings: &AppSettings) -> Result<()> { ... }

// --- API Key Retrieval ---

const KEYRING_SERVICE_PREFIX: &str = "localchat_api_key";

/// Retrieves the API key for a given model configuration.
/// It checks the `api_key_ref` field to determine whether to read from
/// environment variables or the OS keyring.
pub fn get_api_key(config: &ModelConfig) -> Result<String> {
    match config.api_key_ref.as_deref() {
        Some(ref_str) if ref_str.starts_with("env:") => {
            let env_var_name = ref_str.trim_start_matches("env:");
            log::debug!("Retrieving API key from environment variable: {}", env_var_name);
            std::env::var(env_var_name).context(format!(
                "Failed to get API key from environment variable '{}'",
                env_var_name
            ))
        }
        Some(ref_str) if ref_str == "keyring" => {
            let service_name = format!("{}-{}", KEYRING_SERVICE_PREFIX, config.id);
            let entry = Entry::new(&service_name, &config.name) // Use config name as "username"
                .context("Failed to create keyring entry")?;
            log::debug!("Retrieving API key from keyring for service: {}", service_name);
            entry.get_password().context(format!(
                "Failed to get API key from keyring for '{}'. Please set it in settings.",
                config.name
            ))
        }
        Some(other) => Err(anyhow::anyhow!("Unsupported api_key_ref format: {}", other)),
        None => Err(anyhow::anyhow!(
            "API key reference not set for model config '{}'",
            config.name
        )),
    }
}

/// Stores an API key in the OS keyring for the given model configuration.
pub fn set_api_key_in_keyring(config: &ModelConfig, api_key: &str) -> Result<()> {
    let service_name = format!("{}-{}", KEYRING_SERVICE_PREFIX, config.id);
    let entry = Entry::new(&service_name, &config.name)
        .context("Failed to create keyring entry for setting password")?;
    log::info!("Setting API key in keyring for service: {}", service_name);
    entry.set_password(api_key).context(format!(
        "Failed to set API key in keyring for '{}'",
        config.name
    ))
}

// TODO: Add commands for getting/setting keys via keyring in commands.rs 