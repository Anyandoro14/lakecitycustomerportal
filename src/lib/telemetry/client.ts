import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";
import {
  buildPostHogInitOptions,
  canIdentify,
  isPostHogConfigured,
  readTelemetryEnv,
  resolvePostHogHost,
  SESSION_RECORDING_DISABLED,
  type TelemetryEnv,
} from "./config";
import {
  isAnalyticsOptedOut,
  writeAnalyticsOptOutFlag,
} from "./consent";
import { hashUserIdForTelemetry } from "./identify";
import { sanitizeProperties, sanitizeUrl, scrubExceptionText } from "./sanitize";

export type TelemetryCaptureProperties = Record<string, unknown>;

type TransportHook = (payload: {
  event: string;
  properties: TelemetryCaptureProperties;
}) => void;

let initialized = false;
/** True only after a successful posthog.init (not after opt-out / missing-key skip). */
let posthogStarted = false;
let envCache: TelemetryEnv = readTelemetryEnv();
/** Test-only: capture what would be sent without hitting the network. */
let testTransport: TransportHook | null = null;

export function __resetTelemetryForTests(): void {
  initialized = false;
  posthogStarted = false;
  envCache = readTelemetryEnv();
  testTransport = null;
  try {
    posthog.reset?.(true);
  } catch {
    /* ignore */
  }
}

/** Inject a mock transport (unit / local proof). Does not enable network. */
export function __setTelemetryTestTransport(hook: TransportHook | null): void {
  testTransport = hook;
}

export function isTelemetryActive(): boolean {
  return posthogStarted && isPostHogConfigured(envCache) && !isAnalyticsOptedOut();
}

export function getSessionRecordingDisabled(): boolean {
  return SESSION_RECORDING_DISABLED;
}

function scrubCaptureResult(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  const props = sanitizeProperties(
    (event.properties ?? {}) as Record<string, unknown>,
  );
  if (typeof props.$current_url === "string") {
    props.$current_url = sanitizeUrl(props.$current_url);
  }
  if (typeof props.$pathname === "string") {
    props.$pathname = sanitizeUrl(String(props.$pathname).split("?")[0] || "/");
  }
  // STATUTE: never enrich with GeoIP / IP on the client.
  props.$geoip_disable = true;
  props.$ip = null;
  if (event.event === "$exception") {
    for (const key of [
      "$exception_message",
      "$exception_stack_trace_raw",
      "$exception_stack",
      "message",
      "stack",
    ]) {
      if (typeof props[key] === "string") {
        props[key] = scrubExceptionText(props[key] as string);
      }
    }
  }
  event.properties = props as CaptureResult["properties"];
  return event;
}

/**
 * Initialize PostHog once. No-op when key missing or user opted out
 * (checked before init — no network).
 */
export function initTelemetry(env: TelemetryEnv = readTelemetryEnv()): boolean {
  envCache = {
    ...env,
    posthogHost: resolvePostHogHost(env.posthogHost),
  };
  if (initialized) return isTelemetryActive();

  if (isAnalyticsOptedOut()) {
    initialized = true;
    return false;
  }

  if (!isPostHogConfigured(envCache)) {
    initialized = true;
    return false;
  }

  const options = buildPostHogInitOptions(envCache);

  posthog.init(envCache.posthogKey, {
    ...options,
    before_send: (event) => scrubCaptureResult(event),
    loaded: (ph) => {
      try {
        ph.stopSessionRecording?.();
      } catch {
        /* ignore */
      }
    },
  });

  try {
    posthog.stopSessionRecording?.();
  } catch {
    /* ignore */
  }

  initialized = true;
  posthogStarted = true;
  return true;
}

/**
 * Visible "Turn off analytics" control.
 * Persists a single local flag and calls PostHog opt_out / opt_in.
 */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (!enabled) {
    writeAnalyticsOptOutFlag(true);
    try {
      // Always opt out if the SDK is present (safe when not yet started).
      posthog.opt_out_capturing?.();
    } catch {
      /* ignore */
    }
    return;
  }

  writeAnalyticsOptOutFlag(false);

  if (!posthogStarted) {
    initialized = false;
    initTelemetry(envCache);
  }

  try {
    if (posthogStarted) posthog.opt_in_capturing?.();
  } catch {
    /* ignore */
  }
}

export function getAnalyticsEnabled(): boolean {
  return !isAnalyticsOptedOut();
}

/**
 * Identify with SHA-256(userId + salt) only. Never raw ids, email, or names.
 * No-op without keys or salt.
 */
export async function identifyUser(
  internalUserId: string | null | undefined,
): Promise<string | null> {
  if (!canIdentify(envCache) || !isTelemetryActive()) return null;
  const distinctId = await hashUserIdForTelemetry(
    internalUserId,
    envCache.telemetrySalt,
  );
  if (!distinctId) return null;
  posthog.identify(distinctId);
  return distinctId;
}

export function resetTelemetryIdentity(): void {
  if (!isTelemetryActive()) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}

export function captureEvent(
  event: string,
  properties?: TelemetryCaptureProperties,
): void {
  const cleaned = sanitizeProperties(properties ?? {});
  cleaned.$geoip_disable = true;
  cleaned.$ip = null;
  if (testTransport) {
    testTransport({ event, properties: cleaned });
  }
  if (!isTelemetryActive()) return;
  try {
    posthog.capture(event, cleaned);
  } catch {
    /* never break the app for analytics */
  }
}

/** Expose whether the live PostHog config still has recording disabled. */
export function assertSessionRecordingDisabled(): boolean {
  if (!SESSION_RECORDING_DISABLED) return false;
  if (!isTelemetryActive()) return true;
  try {
    const cfg = (posthog as unknown as { config?: { disable_session_recording?: boolean } })
      .config;
    return cfg?.disable_session_recording !== false;
  } catch {
    return true;
  }
}
