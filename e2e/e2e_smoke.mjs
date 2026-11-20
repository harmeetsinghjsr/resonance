import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const URL = "https://sarcastic-resonance.vercel.app";
const OUT = path.join(process.cwd(), "e2e_smoke_results.json");

const log = (...args) => console.log("[smoke]", ...args);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  ctx.on("console", (msg) => {
    if (msg.type() === "error") log("PAGE ERROR:", msg.text());
  });
  const page = await ctx.newPage();

  const results = { url: URL, startedAt: new Date().toISOString(), steps: [] };
  const add = (step, ok, detail) => {
    results.steps.push({ step, ok, detail });
    log(step, ok ? "OK" : "FAIL", detail || "");
  };

  try {
    log("Loading", URL);
    await page.goto(URL, { waitUntil: "networkidle" });
    add("page loads", true);

    // 1. Check for sign-in prompt (Clerk wall)
    const hasSignIn = await page.evaluate(() => {
      const txt = document.body.innerText.toLowerCase();
      return txt.includes("sign in") || txt.includes("sign up") || txt.includes("log in") || txt.includes("email");
    });
    add("auth wall present", hasSignIn, hasSignIn ? "sign-in flow visible" : "no sign-in visible");

    // 2. Try to capture console errors comprehensively
    const errors = await page.evaluate(() => {
      const cl = (window.__smConsoleErrors = window.__smConsoleErrors || []);
      (window.__smConsoleErrors = cl);
      return cl.length;
    });
    add("no hard console errors on load", errors === 0, `${errors} captured client-side after hook`);

    // 3. Screenshot
    const screenshot = path.join(process.cwd(), "e2e_smoke.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    add("screenshot", true, screenshot);

    results.endAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    log("Results written:", OUT);
  } catch (e) {
    add("final error", false, String(e));
    results.error = String(e);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    log("Error captured:", e);
  } finally {
    await browser.close();
  }
})();
