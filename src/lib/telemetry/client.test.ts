import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => {
  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    stopSessionRecording: vi.fn(),
    config: { disable_session_recording: true },
  };
  return { default: posthog };
});

import posthog from "posthog-js";
import {
  __resetTelemetryForTests,
  __setTelemetryTestTransport,
  assertSessionRecordingDisabled,
  captureEvent,
  getSessionRecordingDisabled,
  identifyUser,
  initTelemetry,
  isTelemetryActive,
} from "./client";
import { SESSION_RECORDING_DISABLED, buildPostHogInitOptions } from "./config";

afterEach(() => {
  __resetTelemetryForTests();
  __setTelemetryTestTransport(null);
  vi.clearAllMocks();
});

describe("telemetry inert without keys", () => {
  it("does not call posthog.init or capture when env is missing", () => {
    const ok = initTelemetry({
      posthogKey: "",
      posthogHost: "",
      telemetrySalt: "",
    });
    expect(ok).toBe(false);
    expect(isTelemetryActive()).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();

    captureEvent("payment_flow_started", { source: "test" });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("does not identify without salt / keys", async () => {
    initTelemetry({
      posthogKey: "",
      posthogHost: "https://us.i.posthog.com",
      telemetrySalt: "salt",
    });
    const id = await identifyUser("raw-user-id");
    expect(id).toBeNull();
    expect(posthog.identify).not.toHaveBeenCalled();
  });
});

describe("identify hashing", () => {
  it("identifies with hashed id never raw", async () => {
    initTelemetry({
      posthogKey: "phc_test",
      posthogHost: "https://us.i.posthog.com",
      telemetrySalt: "unit-salt",
    });
    expect(posthog.init).toHaveBeenCalledOnce();

    const distinct = await identifyUser("internal-user-42");
    expect(distinct).toHaveLength(64);
    expect(distinct).not.toBe("internal-user-42");
    expect(posthog.identify).toHaveBeenCalledWith(distinct);
    expect(posthog.identify.mock.calls[0][0]).not.toContain("internal-user");
  });
});

describe("session recorder disabled", () => {
  it("exports disable flag and init options that forbid recording", () => {
    expect(SESSION_RECORDING_DISABLED).toBe(true);
    expect(getSessionRecordingDisabled()).toBe(true);

    const opts = buildPostHogInitOptions({
      posthogKey: "k",
      posthogHost: "https://us.i.posthog.com",
      telemetrySalt: "s",
    });
    expect(opts.disable_session_recording).toBe(true);
    expect(opts.disable_external_dependency_loading).toBe(true);
    expect(opts.persistence).toBe("memory");
    expect(opts.ip).toBe(false);

    initTelemetry({
      posthogKey: "phc_test",
      posthogHost: "https://us.i.posthog.com",
      telemetrySalt: "s",
    });
    expect(assertSessionRecordingDisabled()).toBe(true);
    expect(posthog.stopSessionRecording).toHaveBeenCalled();
  });
});

describe("test transport", () => {
  it("sanitizes properties before mock transport", () => {
    const seen: Array<{ event: string; properties: Record<string, unknown> }> = [];
    __setTelemetryTestTransport((p) => seen.push(p));
    initTelemetry({ posthogKey: "", posthogHost: "", telemetrySalt: "" });
    captureEvent("zikimall_redirected", {
      email: "x@y.com",
      amount: 10,
      source: "pay_page",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].event).toBe("zikimall_redirected");
    expect(seen[0].properties.source).toBe("pay_page");
    expect(seen[0].properties.email).toBeUndefined();
    expect(seen[0].properties.amount).toBeUndefined();
  });
});
