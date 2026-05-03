import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // nsfwjs ships an `import { Buffer } from 'buffer'` that Vite would
      // otherwise treat as externalized (Node built-in) and break the
      // production bundle. Aliasing to the npm `buffer` polyfill makes
      // it work transparently in the browser.
      buffer: "buffer",
    },
  },
  define: {
    // Some browser polyfills (including `buffer`) expect a `global`
    // identifier — Vite's default browser bundle doesn't define one.
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
  },
}));
