import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    clearMocks: true
  },
  resolve: {
    alias: {
      "@n00t/capability-ir": path.resolve(dirname, "packages/capability-ir/index.ts"),
      "@n00t/discovery": path.resolve(dirname, "packages/discovery/src/index.ts"),
      "@n00t/ui": path.resolve(dirname, "packages/ui/index.tsx")
    }
  }
});
