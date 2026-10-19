/**
 * Single local flag for analytics opt-out (STATUTE / UK).
 * PostHog itself uses memory persistence — this flag is the only durable preference.
 */

export const ANALYTICS_OPT_OUT_FLAG = "lakecity_analytics_opt_out";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function getStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** True when the user has turned off analytics. */
export function isAnalyticsOptedOut(storage: StorageLike | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ANALYTICS_OPT_OUT_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Persist opt-out preference. Does not call PostHog — use setAnalyticsEnabled for that. */
export function writeAnalyticsOptOutFlag(
  optedOut: boolean,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return;
  try {
    if (optedOut) storage.setItem(ANALYTICS_OPT_OUT_FLAG, "1");
    else storage.removeItem(ANALYTICS_OPT_OUT_FLAG);
  } catch {
    /* ignore quota / private mode */
  }
}
