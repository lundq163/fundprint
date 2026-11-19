import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // all current tests exercise pure logic, no DOM needed
    include: ["tests/**/*.test.js"],
  },
});
