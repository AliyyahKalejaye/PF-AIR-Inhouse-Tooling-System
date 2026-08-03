// Smoke-test config (Phase 9). Deliberately minimal: jsdom environment +
// the same "@/*" -> "./src/*" alias tsconfig.json already declares, so
// tests can import modules the exact same way app code does. No test
// setup file / custom matchers (e.g. @testing-library/jest-dom) — kept
// out to minimize new dependencies this sandbox has no way to verify
// against the real npm registry (see package.json's devDependencies
// comment-equivalent in this file's sibling doc, and the project's
// established pattern of every new frontend dependency needing the
// user's own `npm install` as the first real check).
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
