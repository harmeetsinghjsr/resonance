import { test, expect } from "@playwright/test";

// WARNING: this runs against the LIVE production site and creates a new Clerk
// account (t<timestamp>@example.com) on every run. Its selectors are also out of
// date. Skipped by default; remove `.skip` only if you really mean to run it.
// Live site smoke test: auth wall -> subscribe -> generate -> playback
const BASE = "https://sarcastic-resonance.vercel.app";
const TEST_EMAIL = `t${Date.now()}@example.com`;
const TEST_CARD = {
  number: "4242424242424242",
  exp: "12/34",
  cvc: "123",
};

test.describe.skip("resonance live generate flow", () => {
  test("full happy path", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const failedReqs: string[] = [];
    page.on("requestfailed", (req) => failedReqs.push(`${req.url()} -> ${req.failure()?.errorText ?? "unknown"}`));

    await test.step("load auth screen", async () => {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await expect(page).toHaveTitle(/resonance/i);
    });

    await test.step("create account", async () => {
      await page.getByRole("button", { name: /sign up|create account/i }).click();
      await page.getByLabel(/email/i).fill(TEST_EMAIL);
      await page.getByLabel(/first name/i).fill("Test");
      await page.getByLabel(/last name/i).fill("User");
      await page.getByPlaceholder(/last/i).fill("User");
      await page.getByRole("button", { name: /continue|create/i }).click();
    });

    await test.step("subscribe with test card", async () => {
      // Wait for checkout modal
      await expect(page).toHaveURL(/.*checkout.*|.*polar.*/i, { timeout: 15000 }).catch(() => {});
      // If not redirected, try clicking subscribe
      const subBtn = page.getByRole("button", { name: /subscribe|upgrade|billing/i });
      if (await subBtn.count()) await subBtn.first().click();
      // Fill card in Stripe iframe
      await page.frameLocator("iframe[name*='stripe']").getByLabel(/card/i).fill(TEST_CARD.number);
    });

    await test.step("generate speech", async () => {
      await page.goto(BASE + "/text-to-speech");
      await page.getByRole("textbox", { name: /text/i }).fill("Hello from Harmeet's Resonance!");
      // pick first voice
      await page.locator("[role='combobox'], [data-radix-select-trigger]").first().click();
      await page.getByRole("option").first().click();
      await page.getByRole("button", { name: /generate/i }).click();
      // wait for completed generation
      await expect(page).toHaveURL(/\/text-to-speech\/[a-f0-9-]+/i, { timeout: 60000 });
    });

    console.log("CONSOLE_ERRORS:", consoleErrors);
    console.log("FAILED_REQS:", failedReqs);
  });
});
