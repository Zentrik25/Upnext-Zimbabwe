import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
