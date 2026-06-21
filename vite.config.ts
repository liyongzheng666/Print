import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "viewer",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5777,
    // Dev-time same-origin proxy to the Bridge (contract §3.5), so the viewer
    // can hit /events (SSE) and /assets without CORS.
    proxy: {
      "/events": { target: "http://127.0.0.1:7341", changeOrigin: true },
      "/assets": { target: "http://127.0.0.1:7341", changeOrigin: true },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5777,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
