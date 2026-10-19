import { test, expect, type Locator, type Request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MOCK_HOST = process.env.MOCK_POSTHOG_HOST || "http://127.0.0.1:8799";
const ARTIFACTS = "/opt/cursor/artifacts";
const SCREENSHOTS = path.join(ARTIFACTS, "screenshots");

function isPostHogRequest(req: Request): boolean {
  const url = req.url();
  return (
    url.startsWith(MOCK_HOST) ||
    url.includes("127.0.0.1:8799") ||
    url.includes("i.posthog.com") ||
    url.includes("app.posthog.com")
  );
}

async function expectOptOutUi(toggle: Locator, page: import("@playwright/test").Page) {
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toHaveAttribute("data-state", "checked");
  await expect(page.getByTestId("analytics-status")).toContainText(
    /Analytics is off on this device/i,
  );
  // Brand-coloured track when checked (primary ≈ rgb(11, 65, 47))
  await expect
    .poll(async () => {
      const bg = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor);
      return bg;
    })
    .toMatch(/rgb\(\s*11,\s*65,\s*47\s*\)/);
}

test.describe("telemetry opt-out evidence", () => {
  test("opt-out stops PostHog network traffic and flag survives reload", async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    const networkLog: string[] = [];
    const beforeOptOut: string[] = [];
    const afterOptOut: string[] = [];
    let optedOut = false;

    page.on("request", (req) => {
      if (!isPostHogRequest(req)) return;
      // Block any accidental real PostHog host
      if (req.url().includes("posthog.com")) {
        networkLog.push(`BLOCKED_REAL ${req.method()} ${req.url()}`);
        return;
      }
      const line = `${new Date().toISOString()} ${req.method()} ${req.url()}`;
      networkLog.push(line);
      if (optedOut) afterOptOut.push(line);
      else beforeOptOut.push(line);
    });

    // Abort any request that somehow targets real PostHog
    await page.route("**/*posthog.com/**", (route) => route.abort());

    // (1) Load login — expect PostHog traffic to mock host
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "opt-out-01-login-before.png"),
      fullPage: true,
    });

    expect(
      beforeOptOut.length,
      `expected PostHog mock requests before opt-out; log=${JSON.stringify(beforeOptOut)}`,
    ).toBeGreaterThan(0);
    expect(
      beforeOptOut.every((l) => l.includes("127.0.0.1:8799")),
      "all pre-opt-out PostHog calls must hit local mock only",
    ).toBe(true);

    // (2) Footer → Privacy & analytics → turn off
    await page.getByRole("link", { name: /privacy & analytics/i }).click();
    await expect(page).toHaveURL(/\/privacy-analytics/);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "opt-out-02-privacy-page.png"),
      fullPage: true,
    });

    const toggle = page.getByTestId("analytics-opt-out-switch");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("analytics-status")).toContainText(
      /Analytics is on on this device/i,
    );

    // Ensure we end ON (checked) — do not click if already opted out
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
    }
    await expectOptOutUi(toggle, page);

    optedOut = true;
    afterOptOut.length = 0;

    await page.screenshot({
      path: path.join(SCREENSHOTS, "opt-out-03-switched-off.png"),
      fullPage: true,
    });

    // Confirm flag in localStorage
    const flagBeforeReload = await page.evaluate(
      () => localStorage.getItem("lakecity_analytics_opt_out"),
    );
    expect(flagBeforeReload).toBe("1");

    // (3) Reload + navigate — zero PostHog requests
    await page.reload({ waitUntil: "networkidle" });
    await expectOptOutUi(page.getByTestId("analytics-opt-out-switch"), page);
    await page.waitForTimeout(2000);
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.goto("/landing", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOTS, "opt-out-04-after-reload-nav.png"),
      fullPage: true,
    });

    expect(
      afterOptOut,
      `expected zero PostHog requests after opt-out; got ${JSON.stringify(afterOptOut)}`,
    ).toEqual([]);

    // (4) Flag survives reload — switch + status still reflect opt-out
    await page.goto("/privacy-analytics", { waitUntil: "networkidle" });
    const flagAfter = await page.evaluate(
      () => localStorage.getItem("lakecity_analytics_opt_out"),
    );
    expect(flagAfter).toBe("1");
    await expectOptOutUi(page.getByTestId("analytics-opt-out-switch"), page);
    await page.screenshot({
      path: path.join(SCREENSHOTS, "opt-out-05-flag-survives.png"),
      fullPage: true,
    });

    const evidence = {
      mockHost: MOCK_HOST,
      beforeOptOutCount: beforeOptOut.length,
      beforeOptOutSample: beforeOptOut.slice(0, 8),
      afterOptOutCount: afterOptOut.length,
      afterOptOut,
      optOutFlag: flagAfter,
      realPostHogBlocked: networkLog.filter((l) => l.startsWith("BLOCKED_REAL")),
      networkLog,
    };

    fs.writeFileSync(
      path.join(ARTIFACTS, "opt-out-network.json"),
      JSON.stringify(evidence, null, 2),
    );

    const md = `# Opt-out evidence

Dummy PostHog key pointed at local mock \`${MOCK_HOST}\` (never real PostHog).

## Results

1. **Login load (before opt-out):** ${beforeOptOut.length} request(s) to mock PostHog host.
2. **Privacy & analytics → Turn off analytics:** switch \`aria-checked=true\`, \`data-state=checked\`, brand primary track; status: Analytics is off on this device; \`lakecity_analytics_opt_out=1\`.
3. **After reload + navigation:** ${afterOptOut.length} PostHog request(s) (must be 0).
4. **Flag after reload:** \`${flagAfter}\` (must be \`1\`); switch still checked with status line.

## Sample pre-opt-out requests

\`\`\`
${beforeOptOut.slice(0, 10).join("\n") || "(none)"}
\`\`\`

## Post-opt-out requests

\`\`\`
${afterOptOut.join("\n") || "(none — expected)"}
\`\`\`

## Screenshots

- \`screenshots/opt-out-01-login-before.png\`
- \`screenshots/opt-out-02-privacy-page.png\`
- \`screenshots/opt-out-03-switched-off.png\`
- \`screenshots/opt-out-04-after-reload-nav.png\`
- \`screenshots/opt-out-05-flag-survives.png\`
`;
    fs.writeFileSync(path.join(ARTIFACTS, "opt-out-evidence.md"), md);
  });
});
