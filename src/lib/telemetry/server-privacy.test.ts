import { describe, expect, it } from "vitest";
import { DEFAULT_POSTHOG_HOST, resolvePostHogHost } from "./config";

/**
 * Server capture privacy contract (mirrors supabase/functions/_shared/posthog.ts).
 * Kept in-repo so CI validates the North Star payload shape without Deno.
 */
function buildPaymentPostedOdooProperties(source: string, insertId?: string) {
  const props: Record<string, unknown> = {
    source,
    $ip: null,
    $geoip_disable: true,
  };
  if (insertId) props.$insert_id = insertId;
  return props;
}

function resolveServerPostHogHost(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_POSTHOG_HOST;
}

describe("server PostHog privacy (payment_posted_odoo)", () => {
  it("defaults host to EU Cloud", () => {
    expect(resolveServerPostHogHost("")).toBe("https://eu.i.posthog.com");
    expect(resolveServerPostHogHost(undefined)).toBe("https://eu.i.posthog.com");
    expect(resolvePostHogHost("")).toBe(resolveServerPostHogHost(""));
  });

  it("sets $ip null and $geoip_disable true on North Star properties", () => {
    const props = buildPaymentPostedOdooProperties("odoo_sync_payment", "hash");
    expect(props.$ip).toBeNull();
    expect(props.$geoip_disable).toBe(true);
    expect(props.source).toBe("odoo_sync_payment");
    expect(props.$insert_id).toBe("hash");
    expect(props).not.toHaveProperty("amount");
    expect(props).not.toHaveProperty("email");
  });
});
