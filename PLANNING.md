# Local LLM Chat App - Planning Document

## 1. Introduction

The goal is to build a local, standalone chat application for interacting with various Large Language Model (LLM) APIs. The application should prioritize a clean user interface, extensibility, performance, and type safety. It will initially run on macOS.

## 2. Core Requirements (Initial Scope)

*   **Standalone Desktop Application:** Native experience on macOS.
*   **Clean & Intuitive UI:** Focus on usability.
*   **Multi-Model Support:** Ability to select and switch between different LLM API providers (e.g., OpenAI, Anthropic, local models via Ollama/LM Studio). Requires a pluggable architecture.
*   **Multi-Turn Conversations:** Standard chat interface displaying dialogue history.
*   **Message Actions:** Basic editing and regeneration of user/assistant messages.
*   **Conversation Management:** Sidebar listing past conversations, allowing switching and potentially renaming/deleting.
*   **Local Storage:** Persist conversations locally.

## 3. Future Goals (Architectural Considerations)

While not in the initial scope, the architecture should ideally accommodate future expansion, including:

*   Branching conversations & response comparison.
*   Enhanced history management (search, import/export from other platforms).
*   Background task/agent execution.
*   Filesystem interactions (reading/writing files based on conversation).
*   Sandboxed code execution for AI-generated code.
*   Multimedia input (PDFs, images).
*   Tool use integration (web search, calculators, sub-LLM calls).

## 4. Technology Stack Discussion

The primary goal is a type-safe, performant application, presenting an opportunity to learn a modern language beyond Python/JS.

### Option 1: TypeScript + Desktop Framework (Electron / Tauri)

*   **Frontend:** React, Vue, Svelte, etc. (Leverages mature web UI ecosystems).
*   **Backend/Core:** Node.js (if Electron) or Rust (if Tauri).
*   **Pros:**
    *   Closer to existing JavaScript knowledge, potentially faster initial UI development.
    *   Vast ecosystem of libraries and UI components.
    *   Good type safety with TypeScript.
    *   Tauri offers a compelling alternative to Electron, using Rust for the backend and the system's webview, resulting in smaller, faster applications.
*   **Cons:**
    *   Electron apps can be resource-intensive (less so with Tauri).
    *   Node.js backend might be less performant for CPU-intensive tasks compared to Rust (though likely sufficient for core chat logic).

### Option 2: Rust + Desktop Framework (Tauri / Native GUI)

*   **Frontend:** Web tech via Tauri (React, Vue, etc.) OR native Rust GUI frameworks (egui, iced, Slint).
*   **Backend/Core:** Rust.
*   **Pros:**
    *   Excellent performance and memory safety (ideal for potential future features like sandboxing).
    *   Strong compile-time type safety.
    *   Tauri integrates seamlessly, allowing web tech for UI while benefiting from Rust backend.
    *   Aligns well with the desire to learn a performant, modern systems language.
    *   Good fit for long-term goals involving complex backend tasks.
*   **Cons:**
    *   Steeper learning curve for Rust compared to TypeScript, especially idioms like ownership and borrowing.
    *   Native Rust GUI frameworks are less mature than established web frameworks (though evolving rapidly). Using web tech via Tauri mitigates this.

### Recommendation: Rust + Tauri

This stack offers the best balance for the stated goals:

1.  **Performance & Safety:** Leverages Rust's core strengths for the application logic.
2.  **Learning Goal:** Provides a solid project for learning Rust.
3.  **Extensibility:** Rust is well-suited for the complex future features envisioned.
4.  **UI Flexibility:** Tauri allows using familiar and productive web technologies (React/Vue/Svelte + TypeScript recommended) for the frontend, separating UI concerns from the core Rust logic. This avoids the potential limitations or learning curve of pure native Rust GUI toolkits for now.
5.  **Desktop Focus:** Directly targets the requirement for a standalone desktop application with a smaller footprint than Electron.

## 5. High-Level Architecture (Rust + Tauri Approach)

*   **Frontend (Tauri Webview):**
    *   Built using a modern web framework (e.g., React, Vue, or Svelte) with TypeScript for type safety.
    *   Handles UI rendering, user input, and displaying conversation state.
    *   Communicates with the Rust backend via Tauri's IPC (Inter-Process Communication) bridge.
*   **Backend (Rust Core):**
    *   Manages core application state (current conversation, settings, list of conversations).
    *   Handles interaction with various LLM APIs (using async Rust - `tokio`, `reqwest`). Define a `trait` for LLM providers to ensure extensibility.
    *   Manages persistent storage (e.g., using `serde` for serialization to JSON/RON files, or `sqlx`/`rusqlite` for SQLite).
    *   Exposes commands/functions callable from the frontend via Tauri.
*   **Communication Layer:** Tauri manages the JS <-> Rust communication, serialization/deserialization of data passed between frontend and backend.

## 6. Development Principles

*   **Type Safety:** Leverage Rust and TypeScript static typing extensively.
*   **Modularity:** Clearly separate UI, state management, API interaction, and storage concerns. Use Rust modules and potentially workspaces.
*   **Extensibility:** Design interfaces (Rust traits) for components like LLM providers and storage backends.
*   **Asynchronous:** Utilize async Rust (`tokio`) for all I/O operations (API calls, file access).
*   **Testing:** Aim for testable units, especially in the Rust core.
*   **Configuration:** Manage API keys and settings securely and flexibly.

## 7. Next Steps

1.  Confirm the choice of Rust + Tauri (with a web framework like React/TypeScript for the frontend).
2.  Create a `DESIGN.md` detailing the specific components, data structures, API interaction flow, and storage format.
3.  Set up the initial project structure using `cargo` and Tauri tooling.
4.  Begin implementing the core data structures and basic UI shell.

# Planning: Future Features

This document outlines potential implementation strategies for upcoming features in LocalChat.

## 1. UI Fixes

### 1.1. Draggable Top Bars

*   **Goal:** Allow dragging the window using the top bar areas (above the conversation list and above the chat area).
*   **Implementation:**
    *   Identify the specific React components representing these top bar areas in `src/App.tsx`.
    *   Apply the `data-tauri-drag-region` HTML attribute to the *outermost* element of these components. Ensure no interactive elements (like buttons or selects) are *inside* the drag region element itself, but rather alongside it or within a non-draggable child container.
    *   **Refinement:** Double-check CSS (padding, margins) to ensure the drag region covers the intended visual area without interfering with clickable elements.

### 1.2. Prevent "Stretchy" Dragging

*   **Goal:** Stop the sidebar and top bars from visually stretching or distorting when performing a two-finger drag (common macOS trackpad behavior).
*   **Implementation:** This is usually controlled by CSS.
    *   Apply `overflow: hidden;` or potentially `overscroll-behavior: none;` to the main application container (`<html>` or `<body>` or the top-level `<div>` in `App.tsx`) and possibly the sidebar (`<aside>`) element. Experimentation might be needed to find the right element(s).
    *   Ensure flexbox/grid layouts are configured correctly to prevent unwanted stretching (`flex-shrink: 0` is already used in places, which helps).

### 1.3. Fix Cmd+N Shortcut

*   **Goal:** Make `Cmd+N` (or `Ctrl+N`) reliably create a new chat.
*   **Implementation:**
    *   **Frontend:** Use the Tauri global shortcut plugin (`@tauri-apps/plugin-global-shortcut`).
    *   Register the `CmdOrCtrl+N` shortcut when the `App` component mounts (`useEffect`).
    *   In the shortcut handler callback, call the existing `handleNewConversation` function.
    *   Ensure the shortcut is unregistered when the app unmounts (`useEffect` cleanup function).
    *   **Alternative (Tauri Core):** Could potentially be handled purely in Rust using `tauri::GlobalShortcutManager` if preferred, emitting an event to the frontend which then calls `handleNewConversation`. The plugin approach is likely simpler for this case.

## 2. Folder System for Chats

*   **Goal:** Allow users to organize conversations into nested folders in the sidebar.
*   **Implementation:**
    *   **Database Schema:**
        *   Add a `parent_id` (nullable TEXT, FOREIGN KEY to `conversations.id`) column to the `conversations` table. A NULL `parent_id` means it's a top-level item.
        *   Add an `item_type` (TEXT, e.g., 'conversation' or 'folder') column to the `conversations` table. Folders won't have messages or a `model_config_id`.
    *   **Backend (Rust):**
        *   Update `models::Conversation` struct to include `parent_id: Option<Uuid>` and `item_type: String`.
        *   Modify `storage::list_conversations` to fetch these new fields. It should return a flat list. The frontend will handle nesting.
        *   Create new commands:
            *   `create_folder(parent_id: Option<String>, title: String) -> Result<Conversation, String>`
            *   `move_item(item_id: String, new_parent_id: Option<String>) -> Result<(), String>` (Updates `parent_id` and `last_updated_at` for sorting).
        *   Modify `delete_conversation` to handle recursive deletion if a folder is deleted (or prevent deletion of non-empty folders).
        *   Update `rename_conversation` to work for folders too.
    *   **Frontend (React):**
        *   Update `App.tsx` state (`conversations`) and the `Conversation` interface.
        *   Modify the sidebar rendering logic:
            *   Recursively process the flat list fetched from the backend to build a nested tree structure based on `parent_id`.
            *   Use a recursive component or helper function to render the nested list.
            *   Employ a UI library component (like `react-arborist` or build a custom one with `shadcn/ui`'s Collapsible) to display the tree with expand/collapse functionality.
            *   Implement drag-and-drop functionality in the sidebar to trigger the `move_item` command.
            *   Add context menus or buttons for creating folders, renaming, and deleting folders/conversations within the tree.

## 3. Multimodal Input

*   **Goal:** Allow users to upload images alongside text prompts for models that support it. Allow uploading text/PDF files for context.
*   **Implementation:**
    *   **Database Schema:**
        *   Modify `messages` table: Add `attachments` (nullable TEXT) column to store JSON array of attachment metadata (e.g., `[{ "id": "uuid", "type": "image", "mime_type": "image/png", "path": "/path/to/local/copy.png", "original_name": "cat.png" }, {"type": "file", ...}]`).
        *   Modify `model_configs` table: Add `supports_images` (INTEGER/BOOLEAN, default 0) and `supports_file_upload` (INTEGER/BOOLEAN, default 0) flags.
    *   **Backend (Rust):**
        *   Update `ModelConfig` struct with `supports_images: bool`, `supports_file_upload: bool`.
        *   Update `Message` struct with `attachments: Option<Vec<AttachmentMetadata>>` (where `AttachmentMetadata` is a new struct).
        *   Modify `add/update_model_config` commands and storage to handle the new flags.
        *   Modify `storage::save_message` to serialize/deserialize attachments JSON.
        *   Modify `commands::send_message`:
            *   Accept optional attachment data (e.g., base64 encoded image, file paths).
            *   When preparing the API request:
                *   Check `model_config.supports_images`.
                *   If sending images, copy the uploaded image to a secure app data directory (e.g., using `app_handle.path().resolve`). Store this *local path* in the `attachments` JSON.
                *   Modify the API call structure (`OpenAIRequestBody` or similar) to match the provider's format for multimodal input (often involves base64 encoding images or providing URLs). Reference OpenAI vision docs for structure.
                *   For file uploads, read file content (potentially chunking large files or using a utility model for summarization) and inject it into the prompt or a separate context field if the API supports it. Store file metadata in `attachments`.
            *   Implement safety: Refuse image/file uploads if the model config doesn't support them.
    *   **Frontend (React):**
        *   Update `ModelConfig` and `Message` interfaces.
        *   Modify `SettingsPage`: Add checkboxes for "Supports Image Input" and "Supports File Upload" in the model config form.
        *   Modify `ChatArea` input:
            *   Add a file input button (e.g., paperclip icon).
            *   Use Tauri's `@tauri-apps/plugin-dialog` `open` function to let users select images/files (filter by allowed types: jpg, png, webp, txt, pdf).
            *   Display thumbnails/previews of selected images/files below the text input area before sending.
            *   When sending (`handleSendMessage`):
                *   Read image files as base64 strings or file paths to send to the backend.
                *   Read text file content. Handle PDFs (potentially require a backend command or library like `pdf-extract` in Rust if parsing is needed beyond simple text injection).
                *   Pass attachment data along with the text content in the `invoke('send_message', ...)` call.
            *   Modify message rendering to display image thumbnails or file icons based on the `attachments` data in the `Message` object.

## 4. Basic Tool Calling Support

*   **Goal:** Enable the LLM to request actions like web search, code execution, or RAG over local data, have the app perform them, and return results.
*   **Implementation:**
    *   **Define Tool Schema:** Standardize a JSON schema for how tools are defined (name, description, parameters) and how the LLM should format its requests. Use OpenAI's function calling/tool usage schema as a basis.
    *   **Backend (Rust):**
        *   Modify `send_message`:
            *   Include the list of available, fixed tools (e.g., "web_search", "python_code_executor", "local_rag") in the initial API request, formatted according to the provider's spec.
            *   Modify the stream/response handling loop:
                *   Detect when the model returns a `tool_calls` block instead of/alongside content.
                *   Parse the requested tool name and arguments.
                *   **Implement Tool Execution:**
                    *   `web_search`: Make HTTP requests (e.g., using `reqwest`) to a search API (like DuckDuckGo API, SerpApi, or Brave Search API - requires API keys/setup). Summarize results concisely.
                    *   `python_code_executor`: Use a sandboxed execution environment. Options:
                        *   `run_script` crate (basic, less secure).
                        *   WASI-based runtime (e.g., `wasmtime` with Python compiled to WASI - more complex, more secure).
                        *   Docker container execution (requires Docker daemon running). **Security is paramount here.** Capture stdout/stderr/errors.
                    *   `local_rag`:
                        *   Build an index (on app start or triggered) of past conversation messages and potentially uploaded text/PDF files using a library like `tantivy` (Rust search library) or a vector embedding approach (requires an embedding model, potentially run locally via `rust-bert` or `candle`, or via API).
                        *   When called, perform a search/similarity query against the index using the tool's arguments and return relevant snippets.
                *   After executing the tool, format the results according to the API spec (e.g., OpenAI requires a specific "tool" role message).
                *   Send a *new* API request including the original history *plus* the assistant's tool request *and* the tool execution result message.
                *   Continue processing the stream from this *second* API call, which should now contain the final assistant response based on the tool output.
            *   Update `Message` model/storage: Add fields to store `tool_calls` (assistant request) and `tool_call_id`/`tool_result` (tool execution messages) to accurately represent the conversation flow.
    *   **Frontend (React):**
        *   Modify message rendering:
            *   Visually distinguish tool request messages from regular assistant content (e.g., different background, icon).
            *   Optionally make tool requests/results collapsible initially.
            *   Display loading indicators while tools are executing in the backend.

## 5. Enhanced UI Elements

*   **Goal:** Improve user feedback during streaming and for complex model reasoning.
*   **Implementation:**
    *   **"Waiting for Response" Indicator:**
        *   In `handleSendMessage` (Frontend), immediately after adding the optimistic user message but *before* the `assistant_stream_started` event arrives, add a temporary placeholder message with a distinct style (e.g., "Assistant is thinking..." with a subtle loading animation like pulsing dots).
        *   In the `assistant_stream_started` listener, *replace* this temporary "thinking" placeholder with the actual (initially empty) assistant message placeholder (which will be filled by chunks).
    *   **Collapsible "Thinking" Sections:**
        *   Requires models that output structured reasoning (e.g., using specific Markdown markers like `<thinking>...</thinking>` or JSON blocks).
        *   **Backend:** No specific changes needed unless parsing/stripping this from the final saved message content is desired.
        *   **Frontend (ReactMarkdown):**
            *   Create a custom ReactMarkdown component override for specific tags (e.g., a custom `<thinking>` tag or a `div` with a specific class used in the Markdown).
            *   This custom component would wrap its `children` in a `shadcn/ui` Collapsible component, defaulting to closed.
            *   Alternatively, use Markdown directives or custom syntax that `remark`/`rehype` plugins can transform into `<details>` elements, which browsers render as collapsible sections.

## 6. Import ChatGPT / Claude Data

*   **Goal:** Allow users to import their conversation history from ChatGPT (`conversations.json`) and Claude (`claude_chats.jsonl`).
*   **Implementation:**
    *   **Backend (Rust):**
        *   Create a new command `import_conversations(file_path: String, source_format: String) -> Result<ImportResult, String>` (`source_format` = 'chatgpt' or 'claude', `ImportResult` contains counts of success/failures).
        *   Implement parsers for each format:
            *   **ChatGPT (`conversations.json`):** Parse the JSON array. Each element represents a conversation with a title and a mapping of message IDs to message objects containing author (`user`/`assistant`/`system`) and content parts. Reconstruct the linear message flow based on message IDs and parent pointers.
            *   **Claude (`claude_chats.jsonl`):** Parse the JSON Lines file. Each line is a JSON object representing a single chat session. Extract title and messages (likely simpler user/assistant pairs).
        *   For each parsed conversation:
            *   Create a new conversation entry in the LocalChat SQLite database using `storage::create_conversation` (perhaps with a placeholder model initially, or try to guess).
            *   Iterate through parsed messages, mapping roles (`system`/`user`/`assistant`).
            *   **Handle Missing Features:** Detect signs of unsupported features (e.g., ChatGPT's `tool_calls`, image content parts, DALL-E generations; Claude's file uploads if present). If detected, insert a placeholder *message* into the LocalChat conversation (e.g., `[System Note: This conversation originally used the 'web_search' tool, which is not fully supported in this import.]`).
            *   Save the mapped/placeholder messages using `storage::save_message`.
            *   Handle potential errors gracefully (malformed data, DB errors) and report counts in `ImportResult`.
    *   **Frontend (React):**
        *   Add an "Import" button/section in Settings.
        *   Use Tauri's dialog plugin to let the user select the JSON/JSONL file.
        *   Invoke the `import_conversations` command with the file path and selected format.
        *   Display progress and the final `ImportResult` (e.g., "Imported 50 conversations, skipped 2 due to errors.").
        *   Trigger a refresh of the conversation list (`loadConversations`).

## 7. Export Data Feature

*   **Goal:** Allow users to export their entire database content to a JSON Lines file.
*   **Implementation:**
    *   **Backend (Rust):**
        *   Create a command `export_data(output_path: String) -> Result<(), String>`.
        *   Inside the command:
            *   Fetch all conversations (`storage::list_conversations`).
            *   Fetch all model configs (`storage::list_model_configs`).
            *   Open the `output_path` file for writing.
            *   Write model configs as JSON objects, one per line.
            *   For each conversation:
                *   Write the conversation metadata as a JSON object on a new line.
                *   Fetch all messages for that conversation (`storage::get_conversation_messages`).
                *   Write each message as a JSON object on a new line.
            *   Use `serde_json::to_string` for serialization and write line-by-line.
    *   **Frontend (React):**
        *   Add an "Export Data" button in Settings.
        *   Use Tauri's dialog plugin `save` function to let the user choose the output file path and name (e.g., `localchat_export.jsonl`).
        *   Invoke the `export_data` command with the chosen path.
        *   Display success or error message.

## 8. System Prompt Builder Workflow

*   **Goal:** Provide a simple UI in settings to generate detailed system prompts using the utility model.
*   **Implementation:**
    *   **Database Schema:** Add a `system_prompts` table (`id TEXT PK`, `name TEXT UNIQUE`, `prompt TEXT NOT NULL`).
    *   **Backend (Rust):**
        *   Add commands: `list_system_prompts`, `save_system_prompt(id: String, name: String, prompt: String)`, `delete_system_prompt(id: String)`.
        *   Add command `generate_system_prompt(user_instructions: String, utility_model_config_id: String) -> Result<String, String>`:
            *   Takes user's brief instructions.
            *   Gets the utility model config and API key.
            *   Constructs a meta-prompt (e.g., "You are a helpful AI assistant designer. Based on the user's request, write a detailed and effective system prompt for an AI chat assistant. User Request: [user_instructions]. Generated Prompt:").
            *   Calls the utility model's non-streaming API (`send_chat_request`) with the meta-prompt.
            *   Returns the generated system prompt string.
    *   **Frontend (React):**
        *   Add a new section/tab in `SettingsPage` for "System Prompt Styles".
        *   Display a list of saved prompts fetched via `list_system_prompts`. Allow selecting, editing (maybe just name?), deleting.
        *   Add a form:
            *   Text area for user instructions ("e.g., Act like a pirate assistant").
            *   Button "Generate Prompt".
            *   When clicked, invoke `generate_system_prompt` (using the selected utility model ID).
            *   Display the returned prompt in another (possibly read-only) text area.
            *   Add a "Save Prompt" button next to the generated prompt display. Requires a name input. Invokes `save_system_prompt`.
        *   **Integration:** Modify the main `ChatArea` or conversation settings to allow selecting a saved system prompt from this bank (this requires further changes to how prompts are constructed in `send_message`).

## 9. Model Context Protocol Integration

*   **Goal:** Integrate with external tools/editors using the Model Context Protocol (details deferred).
*   **Implementation:** (High-level sketch, details depend heavily on the protocol spec)
    *   **Backend:**
        *   Likely involves setting up a local server (HTTP or WebSocket) endpoint within the Tauri app.
        *   Implement handlers for protocol messages (e.g., receiving context updates from an editor, providing context/messages to the external tool).
        *   Requires careful state management to sync context between the Tauri app's state and the external tool via the protocol.
    *   **Frontend:**
        *   UI elements to enable/disable protocol connection, possibly show connection status.
        *   May need to adapt message sending/display logic based on context received via the protocol. 