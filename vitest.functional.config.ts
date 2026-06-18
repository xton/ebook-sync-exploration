/**
 * Functional test config. Intentionally empty until Checkpoint 3.5.
 * Tests here will use testcontainers + a Kindle API simulator and are
 * time-boxed — kept in a separate config so they don't affect `npm test`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/functional/**/*.test.ts"],
    environment: "node",
  },
});
