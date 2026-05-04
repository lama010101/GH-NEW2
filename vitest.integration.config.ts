import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.git/**"]
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "src")
    }
  }
});
