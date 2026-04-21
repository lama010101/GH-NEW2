import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const hasDbConnection = Boolean(process.env.SUPABASE_DB_CONNECTION);

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      ...(!hasDbConnection
        ? [
            "src/server/eventStore.test.ts",
            "src/server/zeroTrust.test.ts",
            "src/server/zeroTrust.execution.test.ts"
          ]
        : [])
    ]
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "src")
    }
  }
});
