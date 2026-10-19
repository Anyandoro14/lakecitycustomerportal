/**
 * Telemetry env resolution. Missing keys → fully inert (no network, no errors).
 * Default PostHog host is EU (STATUTE / UK users).
 */

/** EU Cloud — default for both browser and documented server host. */
export const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

export type TelemetryEnv = {
  posthogKey: string;
  posthogHost: string;
  telemetrySalt: string;
};

export function resolvePostHogHost(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || DEFAULT_POSTHOG_HOST;
}

export function readTelemetryEnv(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): TelemetryEnv {
  return {
    posthogKey: (env.VITE_POSTHOG_KEY ?? "").trim(),
    posthogHost: resolvePostHogHost(env.VITE_POSTHOG_HOST),
    telemetrySalt: (env.VITE_TELEMETRY_SALT ?? "").trim(),
  };
}

/** True when PostHog can be initialized (project key present; host defaults to EU). */
export function isPostHogConfigured(env: TelemetryEnv = readTelemetryEnv()): boolean {
  return Boolean(env.posthogKey);
}

/** Salt is required for identify; capture can still run anonymously without it. */
export function canIdentify(env: TelemetryEnv = readTelemetryEnv()): boolean {
  return isPostHogConfigured(env) && Boolean(env.telemetrySalt);
}

/** Session recording must stay off — exported for tests and docs. */
export const SESSION_RECORDING_DISABLED = true as const;

/**
 * PostHog init options that enforce privacy and make session recording impossible:
 * disable_session_recording + disable_external_dependency_loading (no recorder.js).
 * persistence: memory — no cookies / localStorage from PostHog.
 * ip: false — do not capture client IP; geoip disabled via property on events.
 */
export function buildPostHogInitOptions(env: TelemetryEnv = readTelemetryEnv()) {
  return {
    api_host: resolvePostHogHost(env.posthogHost),
    person_profiles: "identified_only" as const,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: true,
    capture_heatmaps: true,
    disable_session_recording: true,
    /** Prevents loading recorder.js (and other remote extension scripts). */
    disable_external_dependency_loading: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_capture_url_hashes: true,
    /** No cookies or localStorage from PostHog (opt-out flag is separate). */
    persistence: "memory" as const,
    /** Do not capture IP addresses. */
    ip: false,
  };
}
