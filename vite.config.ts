import path from "path"; // Import path module
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from 'vite-tsconfig-paths'; // Re-add tsconfigPaths

// process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tsconfigPaths() // Rely solely on this plugin for path resolution
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // Explicitly enable Tauri internal integration
    internal: {
      tauri: true,
    },
    // Disable FS caching as a potential fix for resolution issues
    fs: {
      cachedChecks: false,
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
