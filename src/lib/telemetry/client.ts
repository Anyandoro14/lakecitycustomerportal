import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";
import {
  buildPostHogInitOptions,
  canIdentify,
  isPostHogConfigured,
  readTelemetryEnv,
  SESSION_RECORDING_DISABLED,
  type TelemetryEnv,
} from "./config";
import { hashUserIdForTelemetry } from "./identify";
import { sanitizeProperties, sanitizeUrl, scrubExceptionText } from "./sanitize";

export type TelemetryCaptureProperties = Record<string, unknown>;

type TransportHook = (payload: {
  event: string;
  properties: TelemetryCaptureProperties;
}) => void;

let initialized = false;
let envCache: TelemetryEnv = readTelemetryEnv();
/** Test-only: capture what would be sent without hitting the network. */
let testTransport: TransportHook | null = null;

export function __resetTelemetryForTests(): void {
  initialized = false;
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
  return initialized && isPostHogConfigured(envCache);
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
 * Initialize PostHog once. No-op (no network) when VITE_POSTHOG_KEY or
 * VITE_POSTHOG_HOST is missing.
 */
export function initTelemetry(env: TelemetryEnv = readTelemetryEnv()): boolean {
  envCache = env;
  if (initialized) return isTelemetryActive();
  if (!isPostHogConfigured(env)) {
    initialized = true; // mark attempted so we don't retry / throw
    return false;
  }

  const options = buildPostHogInitOptions(env);

  posthog.init(env.posthogKey, {
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
  return true;
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
  // Pass only the hashed id — no person properties.
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
