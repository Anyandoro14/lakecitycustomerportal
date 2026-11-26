import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REGISTRATION_RATE_LIMIT_MESSAGE,
  customerFacingEdgeMessage,
  logEdgeFunctionFailure,
  readEdgeFunctionError,
  registrationFailureDescription,
} from "./edge-function-error";

const GENERIC = "Edge Function returned a non-2xx status code";

function invokeError(status: number, body: unknown, contentType = "application/json") {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const response = new Response(raw, {
    status,
    headers: { "Content-Type": contentType },
  });
  const error = new Error(GENERIC);
  error.name = "FunctionsHttpError";
  return Object.assign(error, { context: response });
}

describe("readEdgeFunctionError", () => {
  it("reads status and JSON body from a FunctionsHttpError response", async () => {
    const error = invokeError(400, {
      success: false,
      error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
    });

    const details = await readEdgeFunctionError(error);

    expect(details.status).toBe(400);
    expect(details.body).toMatchObject({
      error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
    });
  });

  it("parses JSON from text() when json() fails", async () => {
    const payload = { success: false, error: "Failed to create account. Please try again." };
    const raw = JSON.stringify(payload);
    const reader = () => ({
      async json(): Promise<unknown> {
        throw new SyntaxError("not json");
      },
      async text() {
        return raw;
      },
    });
    const error = Object.assign(new Error(GENERIC), {
      context: { status: 500, ...reader(), clone: reader },
    });

    await expect(readEdgeFunctionError(error)).resolves.toEqual({ status: 500, body: payload });
  });

  it("keeps plain text when the response body is not JSON", async () => {
    const details = await readEdgeFunctionError(invokeError(500, "Please try again.", "text/plain"));

    expect(details.status).toBe(500);
    expect(details.body).toBe("Please try again.");
  });

  it("returns a null body when the response cannot be parsed", async () => {
    const error = new Error(GENERIC);
    Object.assign(error, {
      context: {
        status: 502,
        json: async () => {
          throw new Error("consumed");
        },
        text: async () => {
          throw new Error("consumed");
        },
      },
    });

    await expect(readEdgeFunctionError(error)).resolves.toEqual({ status: 502, body: null });
  });

  it("keeps existingAccount so the validate step can branch on it", async () => {
    const error = invokeError(409, {
      error: "An account already exists for this stand number. Please login instead.",
      existingAccount: true,
    });

    const details = await readEdgeFunctionError(error);
    expect(details.body).toMatchObject({ existingAccount: true });
  });
});

describe("registrationFailureDescription", () => {
  it("tells the customer to wait up to an hour on 429", async () => {
    const details = await readEdgeFunctionError(
      invokeError(429, { success: false, error: "Too many registration attempts. Please try again later." }),
    );

    expect(registrationFailureDescription(details, GENERIC)).toBe(REGISTRATION_RATE_LIMIT_MESSAGE);
    expect(REGISTRATION_RATE_LIMIT_MESSAGE).toMatch(/tried too many times/i);
    expect(REGISTRATION_RATE_LIMIT_MESSAGE).toMatch(/hour/i);
  });

  it("shows the server message for password, already-registered, and createUser failures", async () => {
    const cases = [
      [400, "Password must be at least 8 characters with uppercase, lowercase, number, and special character"],
      [409, "An account already exists for this stand number. Please login instead."],
      [409, "This email is already associated with another account."],
      [500, "Failed to create account. Please try again."],
    ] as const;

    for (const [status, message] of cases) {
      const details = await readEdgeFunctionError(invokeError(status, { success: false, error: message }));
      expect(registrationFailureDescription(details, GENERIC)).toBe(message);
    }
  });

  it("falls back to the generic invoke message when the body cannot be read", () => {
    expect(registrationFailureDescription({ status: 500, body: null }, GENERIC)).toBe(GENERIC);
  });

  it("hides stack traces and does not echo a password value", () => {
    const stack = "Error: boom\n    at registerUser (supabase/functions/register-user/index.ts:180:11)";
    expect(customerFacingEdgeMessage({ error: stack })).toBeNull();
    expect(registrationFailureDescription({ status: 500, body: { error: stack } }, GENERIC)).toBe(GENERIC);

    const leaked = "password=hunter2";
    expect(customerFacingEdgeMessage({ error: leaked })).toBeNull();
    expect(registrationFailureDescription({ status: 400, body: { message: leaked } }, GENERIC)).toBe(GENERIC);
  });
});

describe("logEdgeFunctionFailure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs status and body without passwords or bearer tokens", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const details = await readEdgeFunctionError(
      invokeError(400, {
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        password: "hunter2",
        nested: { authorization: "Bearer super-secret-token" },
      }),
    );

    logEdgeFunctionFailure("register-user", details);

    expect(spy).toHaveBeenCalledWith("register-user failed", {
      status: 400,
      body: {
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        password: "[redacted]",
        nested: { authorization: "[redacted]" },
      },
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("hunter2");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("super-secret-token");
  });
});
