// Local-only screenshots of the stand-sales wizard with placeholder data.
// Network calls that leave this machine are fulfilled here and never hit a live service.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const label = process.argv[2];
if (label !== "before" && label !== "after") {
  console.error("Usage: node scripts/capture-stand-sales-luxe-screens.mjs <before|after>");
  process.exit(1);
}

const baseURL = process.env.LUXE_BASE_URL || "http://127.0.0.1:8091";
const outDir = path.resolve("docs/stand-sales-wizard/luxe");

const SEED = [
  { standNumber: "3567", phase: "M", landUse: "Residential", sizeSqm: 1200, available: true },
  { standNumber: "3076", phase: "Q", landUse: "Residential", sizeSqm: 1622, available: true },
  { standNumber: "3036", phase: "K", landUse: "Residential", sizeSqm: 1897, available: true },
  { standNumber: "3042", phase: "K", landUse: "Residential", sizeSqm: 2003, available: false },
  { standNumber: "3033", phase: "K", landUse: "Residential", sizeSqm: 2255, available: true },
  { standNumber: "3084", phase: "Q", landUse: "Residential", sizeSqm: 3288, available: true },
];

function standPriceCents(sizeSqm) {
  return Math.round(sizeSqm * 45 * 100);
}

function bandOf(priceCents, minCents, maxCents) {
  const span = maxCents - minCents;
  const offset3 = (priceCents - minCents) * 3;
  if (span === 0 || offset3 < span) return "A";
  if (offset3 < span * 2) return "B";
  return "C";
}

const priced = SEED.map((stand) => ({ ...stand, priceCents: standPriceCents(stand.sizeSqm) }));
const minCents = Math.min(...priced.map((stand) => stand.priceCents));
const maxCents = Math.max(...priced.map((stand) => stand.priceCents));
const stands = priced.map((stand) => ({ ...stand, band: bandOf(stand.priceCents, minCents, maxCents) }));

const paidApplication = {
  id: "app-placeholder",
  standNumber: "3076",
  fullName: "Tariro Moyo",
  email: "tariro@example.com",
  phone: "····0000",
  stage: "paid",
  offer: null,
  paidAt: "2026-11-27T12:00:00.000Z",
  paymentReference: "LC3076-ABCDEFGH",
  paymentAmountCents: 225000,
  portalReady: false,
  agreementStatus: "pending_review",
  executionMethod: null,
  documentUrl: "https://example.invalid/agreement-of-sale-placeholder",
  documentLabel: "Agreement of Sale (placeholder for review)",
  inPersonLine: "Sign in person at the LakeCity Harare office at 128 Domboshava Road, Borrowdale, Harare",
};

let mode = "stands";

function mockBody(request) {
  let body = {};
  try {
    body = request.postDataJSON() ?? {};
  } catch {
    body = {};
  }
  const url = request.url();
  const action = body.action;
  if (url.includes("iveri-init")) {
    return { simulationAllowed: true, reference: "LC3076-ABCDEFGH", amountCents: 225000, result: "pending", title: "Waiting", message: "Test only." };
  }
  if (action === "list-stands") return { stands };
  if (action === "start") {
    return { applicationId: "app-placeholder", accessToken: "placeholder-token", standNumber: body.standNumber || "3076" };
  }
  if (action === "get") {
    const application = mode === "pay"
      ? { ...paidApplication, stage: "offer", paidAt: null, paymentReference: null, paymentAmountCents: null }
      : paidApplication;
    return { application };
  }
  return { ok: true };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(800);
}

async function shot(page, name, width, { fullPage = true } = {}) {
  const file = path.join(outDir, `${name}-${width}-${label}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  console.log(file);
}

async function captureWidth(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    sessionStorage.setItem(
      "lakecity.standSales.session",
      JSON.stringify({ applicationId: "app-placeholder", accessToken: "placeholder-token", standNumber: "3076" }),
    );
  });
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "content-type": "application/json",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const hit = url.pathname.includes("/functions/v1/");
    const body = hit ? JSON.stringify(mockBody(route.request())) : "{}";
    return route.fulfill({ status: 200, headers, body });
  });

  mode = "stands";
  await page.goto(`${baseURL}/stands`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("stands-hero").waitFor();
  await page.getByTestId("stand-3076").waitFor();
  await settle(page);
  await shot(page, "stands", width);

  mode = "detail";
  await page.goto(`${baseURL}/stands/3076`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("stand-summary").waitFor();
  await page.getByRole("heading", { name: "Your details, to begin." }).waitFor({ timeout: 1000 }).catch(() =>
    page.getByRole("heading", { name: "Your details" }).waitFor(),
  );
  await settle(page);
  await shot(page, "stand-detail", width);

  await page.getByLabel("Full name").fill("Tariro Moyo");
  await page.getByLabel("Email").fill("tariro@example.com");
  await page.getByLabel("Phone").fill("0770000000");
  await page.getByRole("button", { name: "Continue to reserve" }).click();
  await page.getByText("Purchaser Tariro Moyo. Your details reserve this stand while you complete your initial payment.").waitFor();
  await settle(page);
  await shot(page, "reserve", width);

  mode = "pay";
  await page.goto(`${baseURL}/stands/3076/pay`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("payment-panel").waitFor();
  await page.getByTestId("pay-by-card").click();
  await page.getByTestId("mock-iveri").waitFor();
  await settle(page);
  await shot(page, "pay", width);

  mode = "welcome";
  await page.goto(`${baseURL}/stands/3076/welcome`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("welcome").waitFor();
  await page.getByRole("heading", { name: /Welcome, Tariro/ }).waitFor();
  await settle(page);
  await shot(page, "welcome", width);

  mode = "portal";
  await page.goto(`${baseURL}/stands/3076/portal`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("create-portal-login").waitFor();
  await settle(page);
  await shot(page, "portal", width);

  mode = "agreement";
  await page.goto(`${baseURL}/stands/3076/agreement`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("agreement-review").waitFor();
  await page.getByText("This is a placeholder for review. It is not your signed Agreement of Sale.").waitFor();
  await settle(page);
  await shot(page, "agreement-review", width);
  await shot(page, "agreement-choice-courier", width);

  await page.getByText("Sign in person", { exact: true }).click();
  await page.getByTestId("in-person-choice").waitFor();
  await settle(page);
  await shot(page, "agreement-choice-in-person", width);
  await context.close();
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await captureWidth(browser, 1280, 900);
  await captureWidth(browser, 390, 844);
} finally {
  await browser.close();
}
