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
const phases = await page.locator('[data-testid="stand-phase"]').count();
check(phases === 38, `every stand card shows its phase (${phases})`);
check((await page.locator("body").innerText()).includes("incl. 15.5% VAT"), "landing shows prices incl. 15.5% VAT");
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

// 5. Card payment step: locked $2,250, one "Pay by card" button, no ZikiMall
await page.waitForURL(/\/payment$/);
const amount = page.locator("#payment-amount");
await amount.waitFor();
check(usd(await amount.inputValue()) === 2250, "payment amount is $2,250");
check((await amount.isEditable()) === false, "payment amount is not editable");
await amount.press("Backspace").catch(() => {});
check(usd(await amount.inputValue()) === 2250, "payment amount unchanged after a keypress");
check(!/zikimall/i.test(await page.locator("main").innerText()), "no ZikiMall on the payment step");
check((await page.locator('[data-testid="pay-by-card"]').innerText()).includes("$2,250"), "pay button names $2,250");
await shot("payment-step-card");
await page.setViewportSize({ width: 390, height: 844 });
await shot("payment-step-mobile");
await page.setViewportSize({ width: 1280, height: 900 });

// Each non-approved iVeri status returns to the payment step with a friendly message and changes nothing.
const refs = new Set();
const attempt = async (choice, expected, name) => {
  await page.locator('[data-testid="pay-by-card"]').click();
  await page.waitForURL(/\/mock-iveri\//);
  const ref = decodeURIComponent(page.url().split("/mock-iveri/")[1].split("?")[0]);
  check(/^LC3076-[A-Z2-9]{8}$/.test(ref) && !refs.has(ref), `new merchant reference per attempt (${ref})`);
  refs.add(ref);
  if (choice === "Approve (status 0)") return ref;
  if (name === "declined-4") await shot("mock-iveri-page");
  await page.getByRole("button", { name: choice }).click();
  await page.waitForSelector(`[data-testid="payment-result"][data-result="${expected}"]`);
  const stage = await page.evaluate((id) => JSON.parse(localStorage.getItem("lakecity-mock-v5")).leads.find((l) => l.id === id).stage, leadId);
  check(stage === "form_filled", `${choice}: application unchanged`);
  await shot(`payment-result-${name}`);
  return ref;
};
await attempt("Denied (4)", "declined", "declined-4");
await attempt("Invalid card (14)", "declined", "invalid-card-14");
await attempt("3-D Secure required (255)", "declined", "3ds-255");
await attempt("Unable to process (9)", "retry_later", "try-later-9");
await attempt("Cancel", "cancelled", "cancelled");
const approvedRef = await attempt("Approve (status 0)");
await page.getByRole("button", { name: "Approve (status 0)" }).click();

// 6. Celebration (status 0 applied once: stand out of inventory, one thank-you email, wizard advanced)
await page.waitForURL(/\/celebration$/);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("lakecity-mock-v5")));
check(after.stands.find((x) => x.standNumber === "3076").status === "paid", "stand 3076 left available inventory");
check(after.outbox.filter((e) => e.template === "payment_thank_you").length === 1, "exactly one thank-you email queued");
// Replaying the same return changes nothing.
await page.goto(`${BASE}/apply/${leadId}/payment?ref=${approvedRef}&kind=success`);
await page.waitForURL(/\/celebration$/);
const replay = await page.evaluate(() => JSON.parse(localStorage.getItem("lakecity-mock-v5")));
check(replay.outbox.length === after.outbox.length && replay.payments.length === after.payments.length, "same reference processed twice changes nothing");
await page.goto(`${BASE}/apply/${leadId}/celebration`);
await page.waitForSelector('[data-testid="celebration"]');
check((await page.locator('[data-testid="celebration"]').innerText()).includes("3076"), "celebration names stand 3076");
await shot("celebration");

// 7. Portal step: stand number + phone -> mock pre-population
await page.goto(`${BASE}/apply/${leadId}/portal`);
await page.waitForSelector("#portal-stand");
const bannerState = async (stage) => page.locator(`[data-testid="portal-progress"] [data-stage="${stage}"]`).getAttribute("data-state");
check((await bannerState("paid")) === "done" && (await bannerState("signed")) === "current", "portal banner: Paid ticked, Signed current");
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
check((await bannerState("portal_active")) === "done", "portal banner: Portal active ticked after enrolment");
await shot("portal-records-prepopulated");
await page.locator('[data-testid="portal-progress"]').screenshot({ path: join(OUT, `${String(++n).padStart(2, "0")}-portal-progress-banner.png`) });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot("portal-banner-mobile", { fullPage: false });
await page.setViewportSize({ width: 1280, height: 900 });

// 8. Contact-only lead (side pane on another stand, no offer yet)
const otherStand = await page.evaluate(() => JSON.parse(localStorage.getItem("lakecity-mock-v5")).stands.find((x) => x.status === "available").standNumber);
await page.goto(`${BASE}/stands/${otherStand}`);
await page.waitForSelector("#fullName");
await fill("#fullName", "Rudo Test Chari");
await fill("#email", "rudo.test@example.com");
await fill("#phone", "+263 77 000 0001");
await page.getByRole("button", { name: /continue to offer form/i }).click();
await page.waitForURL(/\/offer$/);

// 9. Staff views
await page.goto(`${BASE}/internal`);
if (await page.getByRole("button", { name: "Sign in" }).isVisible().catch(() => false)) {
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForSelector("text=/Signed up and Paid \\(/");
check((await page.locator('[data-testid="count-signed_up_paid"]').innerText()).includes("1"), "report counts 1 'Signed up and Paid'");
await page.getByRole("tab", { name: /Signed up and Paid/ }).click();
await shot("staff-dashboard");
await page.locator('[data-testid="tab-contact-only"]').click();
await page.waitForSelector("text=Rudo Test Chari");
check((await page.locator('[data-testid="tab-contact-only"]').innerText()).includes("(1)"), "contact-only tab lists the lead without an offer");
await shot("staff-contact-only-leads");
await page.goto(`${BASE}/internal/leads/${leadId}`);
await page.waitForSelector("text=/Stand 3076/");
await page.waitForTimeout(500);
await shot("staff-lead-detail");

// 10. Outbox: email previews (never sent)
await page.goto(`${BASE}/internal/outbox`);
await page.waitForSelector("text=/Automated ·/");
for (const key of ["offer_completed", "payment_thank_you", "portal_ready"]) {
  const btn = page.locator("ul li button", { hasText: `· ${key}` }).first();
  check((await btn.count()) === 1, `outbox has ${key} preview`);
  await btn.click();
  await page.waitForTimeout(700);
  await shot(`email-${key.replace(/_/g, "-")}`);
}

// 11. Full-length email preview (desktop + mobile) of the thank-you email
await page.locator("ul li button", { hasText: "· payment_thank_you" }).first().click();
await page.waitForTimeout(700);
const html = await page.frameLocator('iframe[title="Email preview"]').locator("html").evaluate((el) => "<!DOCTYPE html>" + el.outerHTML);
check(html.includes("Progress of your purchase") && html.includes("LakeCity Accounts"), "email has the progress bar and LakeCity Accounts sign-off");
const mail = await ctx.newPage();
await mail.setViewportSize({ width: 700, height: 900 });
await mail.setContent(html, { waitUntil: "load" });
await mail.screenshot({ path: join(OUT, `${String(++n).padStart(2, "0")}-email-preview-thank-you.png`), fullPage: true });
await mail.setViewportSize({ width: 390, height: 844 });
await mail.screenshot({ path: join(OUT, `${String(++n).padStart(2, "0")}-email-preview-mobile.png`), fullPage: true });
await mail.close();

await browser.close();
