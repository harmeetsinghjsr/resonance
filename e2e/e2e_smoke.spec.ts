import { test, expect } from "@playwright/test";

const BASE = "https://sarcastic-resonance.vercel.app";

test.describe("Resonance live smoke test", () => {
  test("loads and shows auth wall", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    const notFound: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      const failure = req.failure();
      failedRequests.push(`${url} -> ${failure?.errorText || "unknown"}`);
    });
    page.on("response", (res) => {
      try {
        if (res.status() === 404) {
          notFound.push(res.url());
        }
      } catch {}
    });

    await page.goto(BASE, { waitUntil: "networkidle" });

    // Auth wall
    await expect(page).toHaveTitle(/resonance/i, { timeout: 10000 });
    const body = await page.textContent("body");
    const hasAuth =
      /sign ?in|sign ?up|log ?in|email/i.test(body ?? "");
    expect(hasAuth).toBe(true);

    console.log("AUTH_WALL_OK:", hasAuth);
    console.log("CONSOLE_ERRORS:", errors.length, errors);
    console.log("FAILED_REQUESTS:", failedRequests.length, failedRequests);
    console.log("NOT_FOUND_RESPONSES:", notFound.length, [...new Set(notFound)]);
  });
});
