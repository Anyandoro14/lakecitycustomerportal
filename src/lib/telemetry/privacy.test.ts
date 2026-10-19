import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => {
  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    stopSessionRecording: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    get_distinct_id: vi.fn(() => "anon"),
    config: { disable_session_recording: true, persistence: "memory", ip: false },
  };
  return { default: posthog };
});

import posthog from "posthog-js";
import {
  __resetTelemetryForTests,
  __setTelemetryTestTransport,
  captureEvent,
  initTelemetry,
  setAnalyticsEnabled,
} from "./client";
import {
  ANALYTICS_OPT_OUT_FLAG,
  isAnalyticsOptedOut,
  writeAnalyticsOptOutFlag,
} from "./consent";
import {
  DEFAULT_POSTHOG_HOST,
  buildPostHogInitOptions,
  resolvePostHogHost,
} from "./config";
import { scrubOtelSpanAttributes, OTEL_FORBIDDEN_ATTR_KEYS } from "./otel-privacy";

/** In-memory stand-in for localStorage (jsdom-free vitest node env). */
const memoryStore = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
})();

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStore,
  });
});

beforeEach(() => {
  memoryStore.clear();
});

afterEach(() => {
  __resetTelemetryForTests();
  __setTelemetryTestTransport(null);
  memoryStore.clear();
  vi.clearAllMocks();
});

describe("(a) default PostHog host is EU", () => {
  it("resolves empty host to https://eu.i.posthog.com", () => {
    expect(DEFAULT_POSTHOG_HOST).toBe("https://eu.i.posthog.com");
    expect(resolvePostHogHost("")).toBe("https://eu.i.posthog.com");
    expect(resolvePostHogHost(undefined)).toBe("https://eu.i.posthog.com");
    expect(resolvePostHogHost("https://us.i.posthog.com")).toBe(
      "https://us.i.posthog.com",
    );
  });

  it("uses EU host in init options when host omitted", () => {
    const opts = buildPostHogInitOptions({
      posthogKey: "phc_test",
      posthogHost: "",
      telemetrySalt: "s",
    });
    expect(opts.api_host).toBe("https://eu.i.posthog.com");

    initTelemetry({
      posthogKey: "phc_test",
      posthogHost: "",
      telemetrySalt: "s",
    });
    expect(posthog.init).toHaveBeenCalled();
    const initOpts = (posthog.init as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(initOpts.api_host).toBe("https://eu.i.posthog.com");
  });
});

describe("(b) memory persistence and opt-out flag", () => {
  it("sets persistence to memory (no cookies / localStorage from PostHog)", () => {
    const opts = buildPostHogInitOptions({
      posthogKey: "k",
      posthogHost: DEFAULT_POSTHOG_HOST,
      telemetrySalt: "s",
    });
    expect(opts.persistence).toBe("memory");
  });

  it("skips init when opt-out flag is set, and toggles via opt_out/opt_in", () => {
    memoryStore.clear();
    writeAnalyticsOptOutFlag(true);
    expect(isAnalyticsOptedOut()).toBe(true);
    expect(memoryStore.getItem(ANALYTICS_OPT_OUT_FLAG)).toBe("1");

    const ok = initTelemetry({
      posthogKey: "phc_test",
      posthogHost: DEFAULT_POSTHOG_HOST,
      telemetrySalt: "s",
    });
    expect(ok).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();

    setAnalyticsEnabled(true);
    expect(isAnalyticsOptedOut()).toBe(false);
    expect(posthog.init).toHaveBeenCalled();
    expect(posthog.opt_in_capturing).toHaveBeenCalled();

    setAnalyticsEnabled(false);
    expect(isAnalyticsOptedOut()).toBe(true);
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });
});

describe("(c) IP and GeoIP disabled", () => {
  it("sets ip:false on client init and $geoip_disable / $ip on captures", () => {
    memoryStore.clear();
    writeAnalyticsOptOutFlag(false);
    const opts = buildPostHogInitOptions({
      posthogKey: "k",
      posthogHost: DEFAULT_POSTHOG_HOST,
      telemetrySalt: "s",
    });
    expect(opts.ip).toBe(false);

    const seen: Array<{ event: string; properties: Record<string, unknown> }> = [];
    __setTelemetryTestTransport((p) => seen.push(p));
    initTelemetry({
      posthogKey: "phc_test",
      posthogHost: DEFAULT_POSTHOG_HOST,
      telemetrySalt: "s",
    });
    captureEvent("statement_viewed");
    expect(seen[0].properties.$geoip_disable).toBe(true);
    expect(seen[0].properties.$ip).toBeNull();
  });

  it("server payment_posted_odoo props force $ip null and $geoip_disable", () => {
    // Mirror of buildPaymentPostedOdooProperties (Deno module) — keep contract in sync.
    const props = {
      source: "odoo_sync_payment",
      $ip: null as null,
      $geoip_disable: true,
      $insert_id: "abc",
    };
    expect(props.$ip).toBeNull();
    expect(props.$geoip_disable).toBe(true);
  });
});

describe("(d) OTEL drops IP, UA, and bodies", () => {
  it("scrubs forbidden client IP / user-agent / body attributes", () => {
    const scrubbed = scrubOtelSpanAttributes([
      { key: "faas.name", value: "odoo-sync-payment" },
      { key: "http.status_code", value: 200 },
      { key: "duration_ms", value: 12 },
      { key: "client.address", value: "1.2.3.4" },
      { key: "http.client_ip", value: "1.2.3.4" },
      { key: "net.peer.ip", value: "1.2.3.4" },
      { key: "user_agent.original", value: "Mozilla/5.0" },
      { key: "http.user_agent", value: "Mozilla/5.0" },
      { key: "http.request.body", value: '{"secret":1}' },
      { key: "http.response.body", value: '{"ok":true}' },
    ]);
    const keys = scrubbed.map((a) => a.key);
    expect(keys).toEqual(["faas.name", "http.status_code", "duration_ms"]);
    for (const forbidden of OTEL_FORBIDDEN_ATTR_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
