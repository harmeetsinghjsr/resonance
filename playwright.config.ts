import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { trace: "off" },
  reporter: "list",
});
