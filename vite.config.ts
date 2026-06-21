import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "viewer",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5777,
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
