// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Remove imports and builder logic, just call the lib's run function
fn main() {
    localchat_lib::run();
}

// Remove the greet command if it doesn't belong here
// #[tauri::command]
// fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }
