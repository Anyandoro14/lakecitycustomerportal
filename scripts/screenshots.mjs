// Walks the stand-sales wizard against the local mock backend and saves screenshots.
// Usage: npm run dev (port 8137) then `npm run screenshots` [OUT_DIR=/opt/cursor/artifacts]
// All personal details below are obviously fake demo values.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8137";
const OUT = process.env.OUT_DIR ?? "/opt/cursor/artifacts";
const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));

let n = 0;
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(350);
  await page.evaluate((show) => {
    for (const t of document.querySelectorAll("[data-sonner-toaster]")) t.style.display = show ? "" : "none";
  }, !!opts.toasts);
  const file = join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? true });
  console.log("saved", file);
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`CHECK FAILED: ${msg}`);
  console.log("ok:", msg);
};
const fill = (sel, v) => page.fill(sel, v);
const usd = (s) => Number(s.replace(/[^0-9.]/g, ""));

// Fresh demo data.
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());

// 1. Landing: stand list with sizes and prices
await page.goto(BASE);
await page.waitForSelector('[data-testid="stand-list"] li[data-stand]');
const all = await page.locator('[data-testid="stand-list"] li[data-stand]').count();
check(all === 38, `landing lists 38 stands (got ${all})`);
await shot("landing-stand-list");
await page.setViewportSize({ width: 390, height: 844 });
await shot("landing-mobile", { fullPage: false });
await page.setViewportSize({ width: 1280, height: 900 });

// 2. A/B/C range filters
let bandTotal = 0;
for (const b of ["A", "B", "C"]) {
  await page.click(`[data-testid="filter-${b}"]`);
  await page.waitForTimeout(200);
  const c = await page.locator('[data-testid="stand-list"] li[data-stand]').count();
  bandTotal += c;
  await shot(`landing-range-${b}`);
}
check(bandTotal === all, `ranges A+B+C cover every stand (${bandTotal})`);
await page.click('[data-testid="filter-all"]');

// 3. Stand page with pricing summary + contact side pane
await page.locator('[data-testid="stand-list"] li[data-stand="3076"] a').click();
await page.waitForURL(/\/stands\/3076$/);
await page.waitForSelector('[data-testid="due-now"]');
check(usd(await page.locator('[data-testid="due-now"]').innerText()) === 2250, "stand page shows $2,250 due now");
await shot("stand-selected-pane");
await page.getByRole("button", { name: /continue to offer form/i }).click();
await shot("stand-contact-validation", { toasts: true });
await fill("#fullName", "Tendai Test Moyo");
await fill("#email", "tendai.test@example.com");
await fill("#phone", "+263 77 123 4567");
await page.getByRole("button", { name: /continue to offer form/i }).click();

// 4. Digital offer form
await page.waitForURL(/\/offer$/);
const leadId = page.url().split("/apply/")[1].split("/")[0];
await page.waitForSelector("#nok-name");
await page.getByRole("button", { name: /submit offer/i }).click();
await page.waitForTimeout(300);
await shot("offer-validation-errors", { toasts: true });
await fill("#buyer-dateOfBirth", "1985-03-14");
await page.selectOption("#buyer-idType", "national_id");
await page.selectOption("#buyer-idIssuingCountry", "ZW");
await fill("#buyer-idNumber", "63-446236 Z 61");
await fill("#physicalAddress", "PLACEHOLDER 12 Test Road, Borrowdale, Harare");
await fill("#postalAddress", "PLACEHOLDER P.O. Box 000, Harare");
await page.selectOption("#country", "ZW");
await fill("#nok-name", "Chipo Test Moyo");
await fill("#nok-dob", "1960-11-20");
await fill("#nok-id", "08-2095850 T 42");
await fill("#nok-address", "PLACEHOLDER 4 Example Avenue, Bulawayo");
await fill("#nok-cell", "+263 71 765 4321");
for (const cb of await page.locator('button[role="checkbox"]').all()) {
  if ((await cb.getAttribute("data-state")) !== "checked") await cb.click();
}
await fill("#signedAt", "Harare");
await fill("#purchaserName", "Tendai Test Moyo");
await page.getByLabel("Typed signature").fill("Tendai Test Moyo");
await shot("offer-form-completed");
await page.getByRole("button", { name: /submit offer/i }).click();

// 5. ZikiMall step: locked $2,250
await page.waitForURL(/\/payment$/);
const amount = page.locator("#zikimall-amount");
await amount.waitFor();
check(usd(await amount.inputValue()) === 2250, "ZikiMall amount is $2,250");
check((await amount.isEditable()) === false, "ZikiMall amount is not editable");
await amount.press("Backspace").catch(() => {});
check(usd(await amount.inputValue()) === 2250, "ZikiMall amount unchanged after a keypress");
await shot("payment-zikimall-locked-amount");
await page.getByRole("button", { name: "Simulate payment confirmed" }).click();

// 6. Celebration
await page.waitForURL(/\/celebration$/);
await page.waitForSelector('[data-testid="celebration"]');
check((await page.locator('[data-testid="celebration"]').innerText()).includes("3076"), "celebration names stand 3076");
await shot("celebration");

// 7. Portal step: stand number + phone -> mock pre-population
await page.goto(`${BASE}/apply/${leadId}/portal`);
await page.waitForSelector("#portal-stand");
await fill("#portal-stand", "3076");
await fill("#portal-phone", "0771234560");
await page.getByRole("button", { name: /set up my account/i }).click();
await page.waitForTimeout(400);
await shot("portal-mismatch-error", { toasts: true });
await fill("#portal-phone", "0771234567");
await shot("portal-enter-details");
await page.getByRole("button", { name: /set up my account/i }).click();
await page.waitForSelector('[data-testid="portal-records"]');
const [price, towardPrice, balance] = await Promise.all(
  ["portal-price", "portal-paid-toward-price", "portal-balance"].map(async (id) => usd(await page.locator(`[data-testid="${id}"]`).innerText())),
);
check(Math.abs(price - towardPrice - balance) < 0.005, `portal: price ${price} - paid toward price ${towardPrice} = balance ${balance}`);
await shot("portal-records-prepopulated");

// 8. Staff views
await page.goto(`${BASE}/internal`);
if (await page.getByRole("button", { name: "Sign in" }).isVisible().catch(() => false)) {
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForSelector("text=/Paid \\(/");
await page.getByRole("tab", { name: /Paid/ }).click().catch(() => {});
await shot("staff-dashboard");
await page.goto(`${BASE}/internal/leads/${leadId}`);
await page.waitForSelector("text=/Stand 3076/");
await page.waitForTimeout(500);
await shot("staff-lead-detail");

// 9. Outbox: email previews (never sent)
await page.goto(`${BASE}/internal/outbox`);
await page.waitForSelector("text=/Stage \\d ·/");
for (const key of ["offer_completed", "payment_thank_you", "portal_ready"]) {
  const btn = page.locator("ul li button", { hasText: `· ${key}` }).first();
  check((await btn.count()) === 1, `outbox has ${key} preview`);
  await btn.click();
  await page.waitForTimeout(700);
  await shot(`email-${key.replace(/_/g, "-")}`);
}

await browser.close();
