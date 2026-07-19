import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the app works at any mount path (GitHub Pages serves
  // it under /story_generator/); routing is hash-based, so no server config
  // is needed.
  base: "./",
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
} as any);
