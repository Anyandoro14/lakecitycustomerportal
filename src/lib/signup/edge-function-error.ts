/**
 * Read the status and body off a supabase.functions.invoke failure.
 * FunctionsHttpError puts the Response on `error.context`. The body is still
 * unread, so we parse JSON and fall back to text. Anything we cannot read
 * becomes a null body and the caller keeps its generic message.
 */

export type EdgeFunctionErrorInfo = {
  status: number | null;
  body: unknown;
};

type BodyReader = {
  clone?: () => unknown;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  status?: unknown;
};

const GENERIC_EDGE_FUNCTION_MESSAGE = "Edge Function returned a non-2xx status code";

export const REGISTRATION_RATE_LIMIT_MESSAGE =
  "You've tried too many times. Please wait up to an hour and try again.";

const SECRET_KEY = /password|secret|token|authorization|api[-_]?key|credential/i;
const UNSAFE_CUSTOMER_TEXT =
  /node_modules|service_role|stack trace|sqlstate|\bpostgres\b|\/Users\/|supabase\/functions|Bearer\s+\S+/i;
const EMBEDDED_SECRET = /\b(password|secret|token|api[-_]?key)\b\s*[:=]\s*\S+/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getContext(error: unknown): BodyReader | null {
  if (!isRecord(error)) return null;
  const context = error.context;
  if (!isRecord(context)) return null;
  return context as BodyReader;
}

function readStatus(context: BodyReader | null): number | null {
  const status = context?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function parseMaybeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function freshReader(context: BodyReader): BodyReader | null {
  if (typeof context.clone !== "function") return null;
  try {
    const cloned = context.clone();
    return isRecord(cloned) ? (cloned as BodyReader) : null;
  } catch {
    return null;
  }
}

async function readWith(
  reader: BodyReader,
  method: "json" | "text",
): Promise<unknown> {
  const read = reader[method];
  if (typeof read !== "function") return undefined;
  try {
    const parsed = await read.call(reader);
    if (method === "text") {
      return typeof parsed === "string" ? parseMaybeJson(parsed) : null;
    }
    if (typeof parsed === "string") return parseMaybeJson(parsed);
    return parsed ?? null;
  } catch {
    return undefined;
  }
}

async function readBody(context: BodyReader | null): Promise<unknown> {
  if (!context) return null;

  // Read JSON from a clone when we can, so a failed parse still leaves a body for text().
  const jsonReader = freshReader(context) ?? context;
  const asJson = await readWith(jsonReader, "json");
  if (asJson !== undefined) return asJson;

  const textReader = jsonReader === context ? context : (freshReader(context) ?? context);
  const asText = await readWith(textReader, "text");
  return asText === undefined ? null : asText;
}

export async function readEdgeFunctionError(error: unknown): Promise<EdgeFunctionErrorInfo> {
  const context = getContext(error);
  try {
    return {
      status: readStatus(context),
      body: await readBody(context),
    };
  } catch {
    return { status: readStatus(context), body: null };
  }
}

function rawServerMessage(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (!isRecord(body)) return null;
  if (typeof body.error === "string") return body.error;
  if (typeof body.message === "string") return body.message;
  return null;
}

/** A short server sentence a customer can see. Stack traces and secrets are dropped. */
export function customerFacingEdgeMessage(body: unknown): string | null {
  const raw = rawServerMessage(body);
  if (!raw) return null;
  if (/[\r\n]/.test(raw) || /\bat\s+\S+\s+\(/.test(raw)) return null;
  const message = raw.replace(/[ \t]+/g, " ").trim();
  if (!message || message.length > 280) return null;
  if (UNSAFE_CUSTOMER_TEXT.test(message) || EMBEDDED_SECRET.test(message)) return null;
  if (/^[A-Za-z]*Error:/.test(message)) return null;
  return message;
}

/** Stable signup `code` values are short snake_case tokens. Anything else stays off the toast. */
export function stableErrorCode(body: unknown): string | null {
  if (!isRecord(body) || typeof body.code !== "string") return null;
  const code = body.code.trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) return null;
  return code;
}

export function withStableErrorCode(message: string, code: unknown): string {
  if (typeof code !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(code)) return message;
  if (message.includes(`(${code})`)) return message;
  return `${message} (${code})`;
}

export function registrationFailureDescription(
  info: EdgeFunctionErrorInfo,
  fallbackMessage?: string,
): string {
  const code = stableErrorCode(info.body);
  const withCode = (message: string) => withStableErrorCode(message, code);

  if (info.status === 429) return withCode(REGISTRATION_RATE_LIMIT_MESSAGE);

  const serverMessage = customerFacingEdgeMessage(info.body);
  if (serverMessage) return withCode(serverMessage);

  const fallback = typeof fallbackMessage === "string" ? fallbackMessage.trim() : "";
  if (fallback && customerFacingEdgeMessage(fallback)) return withCode(fallback);
  return withCode(GENERIC_EDGE_FUNCTION_MESSAGE);
}

function redactString(value: string): string {
  return value
    .replace(/\b(password|secret|token|api[-_]?key)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));
  if (!isRecord(value)) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = SECRET_KEY.test(key) || key === "stack" ? "[redacted]" : redactForLog(child, depth + 1);
  }
  return redacted;
}

/** Debug log of the HTTP status and response body. Request secrets and passwords are not included. */
export function logEdgeFunctionFailure(scope: string, info: EdgeFunctionErrorInfo): void {
  console.error(`${scope} failed`, {
    status: info.status,
    body: redactForLog(info.body),
  });
}
