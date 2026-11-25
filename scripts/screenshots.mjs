// Walks the full wizard against the local mock backend and saves screenshots.
// Usage: npm run dev (port 8137) then `npm run screenshots` [OUT_DIR=/opt/cursor/artifacts]
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

// Obviously fake ID image (never a real document).
async function sampleId(label) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 640, height: 400 });
  await p.setContent(`<div style="width:600px;height:360px;margin:20px;border-radius:18px;background:linear-gradient(135deg,#0f4c3a,#1d6b52);color:#fff;font:600 22px system-ui;padding:28px;box-sizing:border-box">
    <div style="color:#d4a72c;font-size:14px;letter-spacing:2px">SAMPLE DOCUMENT - NOT A REAL ID</div>
    <div style="margin-top:24px;font-size:30px">${label}</div>
    <div style="display:flex;gap:24px;margin-top:28px"><div style="width:120px;height:150px;background:#ffffff33;border-radius:8px"></div>
    <div style="font-size:16px;line-height:1.9;font-weight:400">NAME: TEST PERSON<br>DOB: 01/01/1985<br>NO: XX-XXXXXX X XX<br>DEMO ONLY</div></div></div>`);
  const buf = await p.screenshot({ type: "png" });
  await p.close();
  return { name: `${label.toLowerCase().replace(/\s+/g, "-")}.png`, mimeType: "image/png", buffer: buf };
}

const fill = (sel, v) => page.fill(sel, v);
const select = (sel, v) => page.selectOption(sel, v);
const uploads = () => page.locator('input[type="file"]:not([capture])');

async function fillPerson(prefix, p) {
  await fill(`#${prefix}-fullName`, p.name);
  await fill(`#${prefix}-dateOfBirth`, p.dob);
  await fill(`#${prefix}-phone`, p.phone);
  await fill(`#${prefix}-email`, p.email);
  await select(`#${prefix}-idType`, p.idType);
  await select(`#${prefix}-idIssuingCountry`, p.country);
  await fill(`#${prefix}-idNumber`, p.idNumber);
  if (p.expiry) await fill(`#${prefix}-idExpiry`, p.expiry);
}

// 1. Landing (desktop + mobile)
await page.goto(BASE);
await page.waitForSelector("text=Choose your stand");
await shot("landing");
await page.setViewportSize({ width: 390, height: 844 });
await shot("landing-mobile");
await page.setViewportSize({ width: 1280, height: 900 });

// 2. Intake: empty submit -> validation errors
await page.getByRole("link", { name: /choose your stand/i }).first().click();
await page.waitForSelector("#standNumber option:nth-child(2)", { state: "attached" });
await page.getByRole("button", { name: "Submit for ID check" }).click();
await shot("intake-validation-errors-empty", { toasts: true });

// 3. Zimbabwe national ID with a wrong check letter
await select("#standNumber", "3076");
await fillPerson("buyer", {
  name: "Tendai Test Moyo", dob: "1985-03-14", phone: "+263 77 123 4567", email: "tendai.test@example.com",
  idType: "national_id", country: "ZW", idNumber: "63-446236 H 61",
});
await fill("#physicalAddress", "PLACEHOLDER 12 Test Road, Borrowdale, Harare");
await fill("#postalAddress", "PLACEHOLDER P.O. Box 000, Harare");
await select("#country", "ZW");
await uploads().nth(0).setInputFiles(await sampleId("National ID front"));
await page.getByRole("button", { name: "Submit for ID check" }).click();
await page.waitForSelector("text=/check letter/i");
await page.locator("#buyer-idNumber").scrollIntoViewIfNeeded();
await shot("intake-validation-error-zw-check-letter", { fullPage: false, toasts: true });

// 4. Corrected national ID
await fill("#buyer-idNumber", "63-446236 Z 61");
await uploads().nth(1).setInputFiles(await sampleId("National ID back"));
await page.locator("#buyer-idType").scrollIntoViewIfNeeded();
await shot("intake-national-id-zimbabwe");

// 5. Co-owner with a passport
await page.getByRole("button", { name: /add a co-owner/i }).click();
await fillPerson("coowner1", {
  name: "Rudo Test Moyo", dob: "1987-07-02", phone: "+44 7700 900123", email: "rudo.test@example.com",
  idType: "passport", country: "GB", idNumber: "123456789", expiry: "2031-05-31",
});
await uploads().nth(2).setInputFiles(await sampleId("Passport photo page"));
await page.locator("#coowner1-idType").scrollIntoViewIfNeeded();
await shot("intake-passport-co-owner");

// 6. Submit -> pending review
await page.getByRole("button", { name: "Submit for ID check" }).click();
await page.waitForURL(/\/id-review$/);
const leadId = page.url().split("/apply/")[1].split("/")[0];
await page.waitForSelector("text=/checking your ID/i");
await shot("id-pending-review");

// 7. Staff review page (in-app navigation keeps the in-memory ID images)
await page.getByRole("link", { name: /staff|review page/i }).first().click();
await page.waitForURL(/\/internal\/leads\//);
if (await page.getByRole("button", { name: "Sign in" }).isVisible().catch(() => false)) {
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForSelector("text=Review log");
await page.waitForTimeout(800);
await shot("staff-id-review");
await fill("#review-reason", "Both documents legible and match the application (demo).");
await page.getByRole("button", { name: /^\s*Approve/ }).click();
await page.waitForSelector("text=/approved by/i");
await shot("staff-id-approved");

// 8. Back to the customer: offer form
await page.goBack();
await page.waitForSelector("text=Continue to offer form", { timeout: 10000 });
await shot("id-approved-customer");
await page.getByRole("link", { name: "Continue to offer form" }).click();
await page.waitForSelector("#nok-name");
await fill("#businessPhone", "+263 24 000 0000");
await fill("#nok-name", "Chipo Test Moyo");
await fill("#nok-dob", "1960-11-20");
await fill("#nok-id", "08-2095850 T 42");
await fill("#nok-address", "PLACEHOLDER 4 Example Avenue, Bulawayo");
await fill("#nok-cell", "+263 71 765 4321");
for (const cb of await page.locator('button[role="checkbox"]').all()) {
  const label = await cb.evaluate((el) => el.parentElement?.textContent ?? "");
  if (!/3 monthly payments/.test(label)) await cb.click();
}
await fill("#signedAt", "Harare");
await page.getByLabel("Typed signature").fill("Tendai Test Moyo");
await shot("offer-form");
await page.getByRole("button", { name: "Submit offer" }).click();

// 9. Schedule
await page.waitForURL(/\/schedule$/);
await page.waitForSelector("table");
await shot("payment-schedule");
await page.getByRole("button", { name: "Continue to deposit payment" }).click();

// 10. Payment stub
await page.waitForURL(/\/payment$/);
await page.waitForSelector("text=Simulate payment confirmed");
await shot("payment-zikimall-stub");
await page.getByRole("button", { name: "Simulate payment confirmed" }).click();
await page.waitForSelector("text=Sign your agreement of sale");
await shot("payment-confirmed-accounts-created");
await page.getByRole("link", { name: "Sign your agreement of sale" }).click();

// 11. Agreement (DocuSign not configured)
await page.waitForURL(/\/agreement$/);
await page.waitForSelector("text=DocuSign is not configured");
await shot("agreement-docusign-not-configured");
await page.getByRole("button", { name: "Simulate agreement signed" }).click();

// 12. Portal activation
await page.waitForSelector("text=Activate your customer portal");
const portalLink = page.getByRole("link", { name: "Activate your customer portal" });
if (await portalLink.isVisible().catch(() => false)) await portalLink.click();
await page.waitForURL(/\/portal$/);
await page.waitForSelector("#pw");
await shot("portal-activation");
await fill("#pw", "demo-password-123");
await fill("#pw2", "demo-password-123");
await page.getByRole("button", { name: "Activate portal" }).click();

// 13. Celebration
await page.waitForURL(/\/complete$/);
await page.waitForSelector("text=/Log in to your portal/i");
await shot("celebration");

// 14. Internal pages
await page.goto(`${BASE}/internal`);
if (await page.getByRole("button", { name: "Sign in" }).isVisible().catch(() => false)) {
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForSelector("text=/signed/i");
await page.getByRole("tab", { name: /signed/i }).click().catch(() => {});
await shot("internal-dashboard");
await page.goto(`${BASE}/internal/leads/${leadId}`);
await page.waitForSelector("text=Review log");
await shot("internal-lead-detail-portal-activated");

// 15. Outbox: all 7 emails
await page.goto(`${BASE}/internal/outbox`);
await page.waitForSelector("text=/Stage 1 ·/");
const items = page.locator("ul li button");
const count = await items.count();
console.log("outbox emails:", count);
const order = ["intake_submitted", "offer_completed", "schedule_generated", "payment_received", "agreement_signed", "portal_created", "celebration"];
for (const [i, key] of order.entries()) {
  await page.locator("ul li button", { hasText: `· ${key}` }).first().click();
  await page.waitForTimeout(600);
  await shot(`email-${i + 1}-${key.replace(/_/g, "-")}`);
}

await browser.close();
