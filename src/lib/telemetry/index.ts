export {
  initTelemetry,
  identifyUser,
  resetTelemetryIdentity,
  captureEvent,
  isTelemetryActive,
  getSessionRecordingDisabled,
  assertSessionRecordingDisabled,
  setAnalyticsEnabled,
  getAnalyticsEnabled,
  __resetTelemetryForTests,
  __setTelemetryTestTransport,
} from "./client";
export {
  sanitizeUrl,
  sanitizeProperties,
  scrubText,
  scrubExceptionText,
} from "./sanitize";
export { hashUserIdForTelemetry, sha256Hex } from "./identify";
export {
  readTelemetryEnv,
  isPostHogConfigured,
  canIdentify,
  buildPostHogInitOptions,
  resolvePostHogHost,
  DEFAULT_POSTHOG_HOST,
  SESSION_RECORDING_DISABLED,
} from "./config";
export {
  ANALYTICS_OPT_OUT_FLAG,
  isAnalyticsOptedOut,
  writeAnalyticsOptOutFlag,
} from "./consent";
export {
  scrubOtelSpanAttributes,
  OTEL_FORBIDDEN_ATTR_KEYS,
} from "./otel-privacy";
export {
  trackPaymentFlowStarted,
  trackZikimallRedirected,
  trackPaymentInstructionsViewed,
  trackStatementViewed,
  type PaymentInstructionsSection,
} from "./events";
export { paymentTraceHeaders, createTraceparent } from "./trace";
