/**
 * Telemetry env resolution. Missing keys → fully inert (no network, no errors).
 */

export type TelemetryEnv = {
  posthogKey: string;
  posthogHost: string;
  telemetrySalt: string;
};

export function readTelemetryEnv(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): TelemetryEnv {
  return {
    posthogKey: (env.VITE_POSTHOG_KEY ?? "").trim(),
    posthogHost: (env.VITE_POSTHOG_HOST ?? "").trim(),
    telemetrySalt: (env.VITE_TELEMETRY_SALT ?? "").trim(),
  };
}

/** True only when PostHog can be initialized (key + host present). */
export function isPostHogConfigured(env: TelemetryEnv = readTelemetryEnv()): boolean {
  return Boolean(env.posthogKey && env.posthogHost);
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
 */
export function buildPostHogInitOptions(env: TelemetryEnv = readTelemetryEnv()) {
  return {
    api_host: env.posthogHost,
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
    // Prefer path-only targeting; hashes stripped in before_send anyway.
    disable_capture_url_hashes: true,
    persistence: "localStorage+cookie" as const,
  };
}
