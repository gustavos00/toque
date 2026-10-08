import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // PGlite in-memory boots a WASM Postgres per test file; give it room.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
