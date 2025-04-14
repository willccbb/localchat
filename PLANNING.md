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