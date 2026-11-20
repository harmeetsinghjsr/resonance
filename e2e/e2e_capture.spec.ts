import { test, expect, Page } from "@playwright/test";

const BASE = "https://sarcastic-resonance.vercel.app";

test("capture full tRPC mutation request/response", async ({ page }) => {
  const responses: { url: string; status: number; body: string }[] = [];

  page.on("response", async (resp) => {
    const url = resp.url();
    try {
      if (url.includes("/api/trpc")) {
        const body = await resp.text();
        responses.push({ url, status: resp.status(), body: body.slice(0, 2000) });
      }
    } catch {}
  });

  // Load with your existing session cookie so we don't need to sign up
  await page.goto(BASE + "/text-to-speech?text=Hi%2C+I%27m+Harmeet", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/resonance/i);

  // Find any generation button / attempt to read what the page shows
  const txt = await page.textContent("body");
  console.log("PAGE_BODY_SNIPPET:", (txt ?? "").slice(0, 300));

  // Print captured tRPC traffic
  console.log("TRPC_TRAFFIC:");
  for (const r of responses) {
    console.log(`  ${r.status} ${r.url}`);
    console.log(`  body: ${r.body}`);
  }
});
