// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// We only need the main function here, which calls the library
fn main() {
    localchat_lib::run(); // Call the library's run function
}
