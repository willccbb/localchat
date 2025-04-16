# localchat - Local LLM Chat Application

A cross-platform desktop application built with Rust, Tauri v2, React (TypeScript), and Tailwind CSS for interacting with local or remote LLM APIs (OpenAI-compatible). 

## Core Features

*   **Cross-platform:** Runs on macOS (definitely), Windows (maybe), and Linux (maybe).
*   **Local First:** Conversations and configurations are stored locally in a SQLite database.
*   **Privacy-Focused:** No mandatory sign-up or cloud storage for your chats. API keys are stored securely using environment variables or the OS keyring (keyring support pending UI integration).
*   **Multiple Conversations:** Organize chats in separate, persistent conversations.
*   **Conversation Management:** Create, automatically rename (after first response), manually rename, and delete conversations.
*   **Streaming Responses:** View AI responses in real-time as they are generated.
*   **Configurable Models:**
    *   Supports any OpenAI-compatible API endpoint.
    *   Configure multiple models via the Settings page (Add, Edit, Delete).
    *   Select different models per conversation.
    *   Choose a "Utility Model" for background tasks (like conversation naming).
*   **Markdown Rendering:**
    *   GitHub Flavored Markdown (GFM).
    *   LaTeX math rendering (KaTeX).
    *   Code syntax highlighting (highlight.js).
    *   Mermaid diagrams.
*   **Modern UI:** Built with React, TypeScript, Tailwind CSS, and shadcn/ui components.

## Setup & Running Locally

**Prerequisites:**

1.  **Node.js & pnpm:** Install Node.js (LTS recommended) from [nodejs.org](https://nodejs.org/). Then install pnpm: `npm install -g pnpm`.
2.  **Rust:** Install Rust via [rustup.rs](https://rustup.rs/).
3.  **Tauri v2 Prerequisites:** Follow the Tauri setup guide for your OS: [Tauri Prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites/). This typically involves installing build tools (like a C++ compiler, `webkit2gtk` on Linux, etc.).

**Running:**

1.  **Clone:** `git clone <repository-url>`
2.  **Navigate:** `cd localchat`
3.  **Install Frontend Deps:** `pnpm install`
4.  **Run Development App:**
    ```bash
    pnpm tauri dev
    ```
    This compiles the Rust backend, starts the Vite frontend dev server, and opens the application window. Changes to frontend code (`src/`) will hot-reload. Changes to backend code (`src-tauri/`) require restarting the command.

    **Note on Database Schema Changes:** If you modify SQL queries within the Rust code (`src-tauri/src/storage.rs`), the `sqlx` library needs to verify these changes against the database schema during compilation. For this verification to work, you must have the `DATABASE_URL` environment variable set when running `pnpm tauri dev`. 
    Example (macOS/Linux - adjust path as needed):
    ```bash
    DB_PATH="$HOME/Library/Application Support/com.localchat.app/localchat.sqlite"
    mkdir -p "$(dirname "$DB_PATH")" # Ensure directory exists
    DATABASE_URL="sqlite://$DB_PATH?mode=rwc" pnpm tauri dev
    ```
    If you don't modify SQL queries, you usually don't need to set `DATABASE_URL` explicitly for `tauri dev`.

## Building (Currently Not Working)

The standard command to build a standalone application is:

```bash
pnpm tauri build
```

However, this is currently **not functional**. Development and testing should use `pnpm tauri dev`.

*(Previous sections about SQLx CLI and preparing the query cache are omitted for simplicity, as `tauri dev` handles this sufficiently for development)*

## Linting & Formatting (Optional)

*   **Rust:** `cargo fmt` and `cargo clippy -- -D warnings` (run from `src-tauri/` or use `--manifest-path src-tauri/Cargo.toml`)
*   **TypeScript/React:** Configure ESLint/Prettier as desired.
