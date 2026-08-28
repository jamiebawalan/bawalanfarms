import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // The components are plain JSX; esbuild's automatic runtime is enough,
  // and saves pulling in a React plugin just to render a button in a test.
  esbuild: { jsx: "automatic" },
  test: {
    // Most tests are pure functions; the write queue needs localStorage, and
    // says so with a per-file @vitest-environment comment.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
