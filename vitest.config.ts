import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/features/memory-console/web/src", import.meta.url)),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.agent-state/**",
    ],
  },
});
