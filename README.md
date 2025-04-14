# LocalChat - Local LLM Chat Application

A desktop application built with Rust, Tauri v2, React (TypeScript), and Tailwind CSS for interacting with various LLM APIs locally.

## Features

*   Cross-platform Desktop App (via Tauri)
*   React + TypeScript Frontend with Tailwind CSS & shadcn/ui
*   Rust Backend Core using Tokio & SQLx
*   SQLite database for storing conversations and messages
*   **Conversations:** List, create, rename, and delete conversations.
*   **Messaging:** Send messages to configured LLM APIs (currently streams basic text).
*   **Model Configuration:** Add, list, and delete LLM API configurations (OpenAI-compatible format) via Settings.
*   **Chat Interface:** Sidebar for conversations, main chat view, model selection per conversation.
*   **Markdown Rendering:**
    *   GitHub Flavored Markdown (GFM) support (tables, etc.).
    *   LaTeX math rendering (via KaTeX).
    *   Code syntax highlighting (via highlight.js).
    *   Mermaid diagram rendering.
    *   Support for definition lists (`<dl>`) and collapsible sections (`<details>`).
    *   Links automatically open in the system's default browser.

## Setup

**Prerequisites:**

1.  **Node.js and pnpm:** Install Node.js (LTS recommended) from [nodejs.org](https://nodejs.org/). Then install pnpm globally: `npm install -g pnpm`
2.  **Rust:** Install Rust via [rustup.rs](https://rustup.rs/).
3.  **Tauri v2 Prerequisites:** Follow the Tauri setup guide for your OS: [Tauri Prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites/). This usually involves installing build tools (like C++ compiler, webview libraries).
4.  **SQLx CLI:** Install the command-line tool for `sqlx` database checks: 
    ```bash
    cargo install sqlx-cli --no-default-features --features native-tls,sqlite
    ```

**Installation:**

1.  Clone the repository: `git clone <repository-url>`
2.  Navigate into the project directory: `cd localchat`
3.  Install frontend dependencies: `pnpm install`
4.  Prepare the SQLx query cache (needed once initially and after changing SQL queries in `src-tauri/src/storage.rs` if not using `sqlx watch`):
    ```bash
    # Define the database path (adjust for your OS if needed)
    # macOS Example:
    DB_PATH="$HOME/Library/Application Support/com.localchat.app/localchat.sqlite"
    # Linux Example (adjust path):
    # DB_PATH="$HOME/.local/share/com.localchat.app/localchat.sqlite"
    # Windows Example (adjust path):
    # DB_PATH="%APPDATA%\com.localchat.app\localchat.sqlite"

    # Create the directory if it doesn't exist (important!)
    mkdir -p "$(dirname "$DB_PATH")"
    
    # Run prepare from the project root
    DATABASE_URL="sqlite://$DB_PATH?mode=rwc" cargo sqlx prepare --workspace
    ```
    *Note: The `.sqlx` directory generated in `src-tauri/` should be committed to version control.* 

## Development

1.  Navigate to the project directory (`localchat`).
2.  Run the Tauri development server:
    ```bash
    pnpm tauri dev
    ```
    This compiles the Rust backend, starts the Vite frontend dev server, and opens the application window. Changes to frontend code (`src/`) will hot-reload. Changes to backend code (`src-tauri/`) require a restart of the dev server.

3.  **(Optional but Recommended) Run SQLx Watch:** To automatically update the SQLx query cache when you modify Rust code containing SQL queries, open a **separate terminal** in the project root and run (using the `DB_PATH` variable from Installation step 4):
    ```bash
    DATABASE_URL="sqlite://$DB_PATH?mode=rwc" cargo sqlx watch --workspace
    ```
    Leave this running while you develop.

## Building

1.  Navigate to the project directory (`localchat`).
2.  Ensure dependencies are installed (`pnpm install`).
3.  Run the Tauri build command:
    ```bash
    pnpm tauri build
    ```
    This creates a production build of the frontend and bundles it with the compiled Rust backend into a native application installer/package located in `src-tauri/target/release/bundle/`.

## Linting & Formatting (Optional)

*   **Rust:** `cargo fmt` and `cargo clippy -- -D warnings` (run from `src-tauri/` or use `--manifest-path src-tauri/Cargo.toml`)
*   **TypeScript/React:** Configure ESLint/Prettier as desired.
