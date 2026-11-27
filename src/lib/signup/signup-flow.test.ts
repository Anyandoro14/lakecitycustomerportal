import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registrationFailureDescription } from "./edge-function-error";
import {
  LIVE_PROFILE_WRITE_COLUMNS,
  emailDomain,
  isMissingColumnError,
  liveProfileWrite,
  mapAuthAdminCreateError,
  normalizeSignupPhone,
  phoneLast4,
  readSignupText,
  signupAuthEmail,
  signupLogLine,
  signupPhonesMatch,
  signupStandsMatch,
} from "../../../supabase/functions/_shared/signup-flow";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("signup normalisation", () => {
  it("treats a local 0 prefix, spaces, and +263 as the same Zimbabwe number", () => {
    expect(normalizeSignupPhone("0771 234 567")).toBe("+263771234567");
    expect(normalizeSignupPhone("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizeSignupPhone("(077) 123-4567")).toBe("+263771234567");
    expect(signupPhonesMatch("0771 234 567", "+263771234567")).toBe(true);
    expect(signupPhonesMatch("0771234567", "263771234567")).toBe(true);
    expect(signupPhonesMatch("0771234567", "+263771000000")).toBe(false);
  });

  it("does not treat stand 272, Stand 272, and a numeric 272 as different once coerced to text", () => {
    expect(readSignupText(272)).toBe("272");
    expect(readSignupText(" 272 ")).toBe(" 272 ");
    expect(signupStandsMatch("272", " 272 ")).toBe(true);
    expect(signupStandsMatch("272", "Stand 272")).toBe(false);
    expect(signupStandsMatch("stand 272", "Stand 272")).toBe(true);
  });

  it("lowercases the auth email and keeps only the domain for logs", () => {
    expect(signupAuthEmail("Owner@LakeCity.co.zw", "272")).toBe("owner@lakecity.co.zw");
    expect(signupAuthEmail("  ", "Stand 272")).toBe("stand-stand272@lakecity.portal");
    expect(signupAuthEmail(undefined, "272")).toBe("stand-272@lakecity.portal");
    expect(emailDomain("Owner@LakeCity.co.zw")).toBe("lakecity.co.zw");
    expect(phoneLast4("+263771234567")).toBe("4567");
  });
});

describe("live profile write", () => {
  it("upserts only columns that exist on live profiles", () => {
    const row = liveProfileWrite({
      id: "user-1",
      email: "owner@lakecity.co.zw",
      phoneNumber: "+263771234567",
      standNumber: "272",
      paymentPlanMonths: 36,
    });
    expect(Object.keys(row).sort()).toEqual([...LIVE_PROFILE_WRITE_COLUMNS].sort());
    expect(row).not.toHaveProperty("tenant_id");
    expect(row).not.toHaveProperty("payment_start_date");
    console.log("profile write before", JSON.stringify({
      op: "update",
      columns: ["stand_number", "phone_number", "email", "payment_plan_months"],
      filter: "id, and tenant_id when the JWT has one",
      onError: "log and continue; no deleteUser",
    }));
    console.log("profile write after", JSON.stringify({ op: "upsert", onConflict: "id", row }));
  });

  it("does not delete the auth user or add an auth.users trigger", () => {
    const source = readFileSync(path.join(repoRoot, "supabase/functions/register-user/index.ts"), "utf8");
    expect(source).not.toMatch(/deleteUser/);
    expect(source).not.toMatch(/\.eq\(["']tenant_id["']\)/);
    expect(existsSync(path.join(repoRoot, "supabase/migrations/20261127134500_safe_auth_login_hook.sql"))).toBe(false);
  });
});

describe("register-user error mapping", () => {
  const beforeCreateUserFailure = {
    success: false,
    error: "Failed to create account. Please try again.",
  };

  it("maps a missing profiles.tenant_id failure to schema_mismatch", () => {
    const mapped = mapAuthAdminCreateError({
      status: 500,
      code: "unexpected_failure",
      message: 'column "tenant_id" of relation "profiles" does not exist',
    });
    const after = { success: false, error: mapped.error, code: mapped.code };

    console.log("register-user createUser before", JSON.stringify({ status: 500, body: beforeCreateUserFailure }));
    console.log("register-user createUser after", JSON.stringify({ status: mapped.status, body: after }));

    expect(mapped.status).toBe(500);
    expect(after).toEqual({
      success: false,
      code: "schema_mismatch",
      error: "We couldn't create the account because the server is missing a required setting. Please contact LakeCity.",
    });
    expect(isMissingColumnError({ code: "42703", message: 'column "tenant_id" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'tenant_id' column of 'profiles' in the schema cache" })).toBe(true);
  });

  it("maps GoTrue email, phone, and password failures without hiding them as a generic 500", () => {
    expect(mapAuthAdminCreateError({
      message: "A user with this email address has already been registered",
      code: "email_exists",
      status: 422,
    })).toMatchObject({ status: 409, code: "email_already_registered" });

    expect(mapAuthAdminCreateError({
      message: "Phone number already registered",
      code: "phone_exists",
      status: 422,
    })).toMatchObject({ status: 409, code: "phone_already_registered" });

    expect(mapAuthAdminCreateError({
      message: "Password should be at least 6 characters",
      code: "weak_password",
      status: 422,
    })).toMatchObject({ status: 400, code: "password_policy" });

    expect(mapAuthAdminCreateError({
      message: "Database error creating new user",
      code: "unexpected_failure",
      status: 500,
    })).toMatchObject({
      status: 500,
      code: "create_user_failed",
      error: "Failed to create account. Please try again.",
    });
  });

  it("shows the stable code on the toast and never logs the password or full phone", () => {
    const body = {
      success: false,
      code: "schema_mismatch",
      error: "We couldn't create the account because the server is missing a required setting. Please contact LakeCity.",
    };
    expect(registrationFailureDescription({ status: 500, body }, "Edge Function returned a non-2xx status code"))
      .toBe(`${body.error} (schema_mismatch)`);

    const line = signupLogLine({
      fn: "register-user",
      request_id: "req-272",
      step: "create_user",
      stand_number: "272",
      phone_last4: phoneLast4("+263771234567"),
      email_domain: emailDomain("owner@lakecity.co.zw"),
      status: 500,
      error_code: "schema_mismatch",
      error_message: 'column "tenant_id" does not exist password=hunter2 Bearer super-secret owner@lakecity.co.zw',
    });
    console.log("register-user log line", line);
    expect(line).toContain('"stand_number":"272"');
    expect(line).toContain('"phone_last4":"4567"');
    expect(line).toContain('"email_domain":"lakecity.co.zw"');
    expect(line).toContain('"step":"create_user"');
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("super-secret");
    expect(line).not.toContain("+263771234567");
    expect(line).not.toContain("owner@");
  });
});
