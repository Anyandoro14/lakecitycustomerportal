import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8137,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/functions/_shared/**/*.test.ts"],
  },
} as Parameters<typeof defineConfig>[0]);
