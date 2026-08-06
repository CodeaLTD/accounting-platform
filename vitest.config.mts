import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // NOTE: not inherited by `test.projects` below — Vitest projects do NOT
    // pick up root-level `test` options. This is intentionally left here as
    // a documented no-op (not deleted) because a previous incorrect
    // assumption that projects inherit from root caused real debugging
    // pain. Each project below that needs setupFiles declares its own copy.
    setupFiles: ["./vitest.setup.ts"],
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/core/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "src/components/**/*.test.ts?(x)",
            "src/app/**/*.test.ts?(x)",
            "src/platform/**/*.test.ts?(x)",
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
      },
    ],
  },
  // NOTE: not inherited by `test.projects` above — same non-inheritance
  // caveat as the root-level `test.setupFiles` note above. Left here as a
  // documented no-op rather than deleted; the "jsdom" project declares its
  // own `resolve.alias` copy where it's actually needed.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
