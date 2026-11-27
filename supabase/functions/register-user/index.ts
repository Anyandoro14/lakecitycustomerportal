import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { checkStandPortalEnrolled } from "../_shared/portal-enrollment.ts";
import {
  SIGNUP_PASSWORD_PATTERN,
  emailDomain,
  isMissingColumnError,
  logSignupEvent,
  mapAuthAdminCreateError,
  phoneLast4,
  readSignupText,
  signupAuthEmail,
  type SignupLogEvent,
} from "../_shared/signup-flow.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterUserRequest {
  standNumber: string;
  phoneNumber: string;
  password: string;
  email?: string;
  /** Matches Collection Schedule tab "Collection Schedule - Nmo" (or legacy "N Months") from validate-signup */
  paymentPlanMonths?: number;
}

type QueryError = { code?: string | null; message?: string | null } | null;
type ProfileRow = { id: string } | null;
type ProfileQuery = {
  eq: (column: string, value: string) => ProfileQuery;
  maybeSingle: () => Promise<{ data: ProfileRow; error: QueryError }>;
  then?: never;
};

// Rate limiting: max 3 registration attempts per phone per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const registrationAttempts = new Map<string, { count: number; firstAttempt: number }>();

const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, value] of registrationAttempts.entries()) {
    if (now - value.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      registrationAttempts.delete(key);
    }
  }
};

function twilioSummary(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const code = record.code ?? record.error_code;
  const message = record.message ?? record.error_message;
  const parts = [code, message].filter((part) => part != null && part !== "");
  return parts.length ? String(parts.join(": ")) : null;
}

async function findProfile(
  supabase: { from: (table: string) => { select: (columns: string) => ProfileQuery } },
  match: { standNumber?: string; email?: string },
  tenantId: string | undefined,
): Promise<{ data: ProfileRow; error: QueryError; retriedWithoutTenant: boolean }> {
  const run = (withTenant: boolean) => {
    let query = supabase.from("profiles").select("id");
    if (match.standNumber) query = query.eq("stand_number", match.standNumber);
    if (match.email) query = query.eq("email", match.email);
    if (withTenant && tenantId) query = query.eq("tenant_id", tenantId);
    return query.maybeSingle();
  };

  const first = await run(Boolean(tenantId));
  if (tenantId && isMissingColumnError(first.error)) {
    const second = await run(false);
    return { data: second.data, error: first.error ?? second.error, retriedWithoutTenant: true };
  }
  return { ...first, retriedWithoutTenant: false };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  let step = "parse";
  let standForLog: string | null = null;
  let phoneForLog: string | null = null;
  let emailForLog: string | null = null;

  const respond = (
    status: number,
    code: string,
    body: Record<string, unknown>,
    errorMessage?: string | null,
  ) => {
    const event: SignupLogEvent = {
      fn: "register-user",
      request_id: requestId,
      step,
      stand_number: standForLog,
      phone_last4: phoneLast4(phoneForLog),
      email_domain: emailDomain(emailForLog),
      status,
      error_code: code,
      error_message: errorMessage ?? (typeof body.error === "string" ? body.error : null),
    };
    logSignupEvent(event);
    return new Response(JSON.stringify({ ...body, code, request_id: requestId }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  };

  try {
    const body = await req.json() as RegisterUserRequest;
    const standText = readSignupText(body.standNumber);
    const phoneText = readSignupText(body.phoneNumber);
    const password = body.password;
    const email = readSignupText(body.email) ?? undefined;
    const paymentPlanMonths = body.paymentPlanMonths;

    step = "validate_input";
    if (!standText) {
      return respond(400, "stand_required", { success: false, error: "Stand number is required" });
    }
    if (!phoneText) {
      return respond(400, "phone_required", { success: false, error: "Phone number is required" });
    }
    if (!password || typeof password !== "string") {
      return respond(400, "password_required", { success: false, error: "Password is required" });
    }

    const trimmedStand = standText.trim();
    const trimmedPhone = phoneText.trim();
    standForLog = trimmedStand;
    phoneForLog = trimmedPhone;
    const planMonths =
      typeof paymentPlanMonths === "number" && paymentPlanMonths > 0
        ? Math.round(paymentPlanMonths)
        : 36;

    if (!SIGNUP_PASSWORD_PATTERN.test(password)) {
      return respond(400, "password_policy", {
        success: false,
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
      });
    }

    step = "rate_limit";
    cleanupRateLimits();
    const rateLimitKey = trimmedPhone;
    const attemptRecord = registrationAttempts.get(rateLimitKey);

    if (attemptRecord) {
      if (Date.now() - attemptRecord.firstAttempt < RATE_LIMIT_WINDOW_MS) {
        if (attemptRecord.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          return respond(429, "rate_limited", {
            success: false,
            error: "Too many registration attempts. Please try again later.",
          });
        }
        attemptRecord.count++;
      } else {
        registrationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
      }
    } else {
      registrationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    let tenantId: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      const userToken = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseAdmin.auth.getUser(userToken);
      const appMeta = userData?.user?.app_metadata as { tenant_id?: string } | undefined;
      tenantId = appMeta?.tenant_id;
    }

    step = "profile_lookup";
    const existingProfile = await findProfile(supabaseAdmin, { standNumber: trimmedStand }, tenantId);
    if (existingProfile.retriedWithoutTenant) {
      logSignupEvent({
        fn: "register-user",
        request_id: requestId,
        step: "profile_lookup_skip_tenant",
        stand_number: standForLog,
        phone_last4: phoneLast4(phoneForLog),
        email_domain: null,
        status: 0,
        error_code: "schema_mismatch",
        error_message: existingProfile.error?.message ?? "profiles.tenant_id is not available",
      });
    }

    if (existingProfile.data) {
      return respond(409, "stand_already_registered", {
        success: false,
        error: "An account already exists for this stand number. Please login instead.",
      });
    }

    step = "enrollment";
    const portalCheck = await checkStandPortalEnrolled(supabaseAdmin, tenantId, trimmedStand);
    if (!portalCheck.enrolled) {
      return respond(403, "not_enrolled", { success: false, error: portalCheck.message });
    }

    const authEmail = signupAuthEmail(email, trimmedStand);
    emailForLog = authEmail;

    step = "email_lookup";
    const existingByEmail = await findProfile(supabaseAdmin, { email: authEmail }, tenantId);
    if (existingByEmail.data) {
      return respond(409, "email_already_registered", {
        success: false,
        error: "This email is already associated with another account.",
      });
    }

    step = "create_user";
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        stand_number: trimmedStand,
        phone_number: trimmedPhone,
      },
    });

    if (authError || !authData?.user) {
      const mapped = mapAuthAdminCreateError({
        message: authError?.message,
        code: authError?.code,
        status: authError?.status,
      });
      return respond(mapped.status, mapped.code, { success: false, error: mapped.error }, authError?.message ?? "createUser returned no user");
    }

    const userId = authData.user.id;

    step = "profile_update";
    const profilePatch = {
      stand_number: trimmedStand,
      phone_number: trimmedPhone,
      email: authEmail,
      payment_plan_months: planMonths,
    };
    let profileUpdate = supabaseAdmin.from("profiles").update(profilePatch).eq("id", userId);
    if (tenantId) profileUpdate = profileUpdate.eq("tenant_id", tenantId);
    let { error: profileError } = await profileUpdate;
    if (tenantId && isMissingColumnError(profileError)) {
      const retry = await supabaseAdmin.from("profiles").update(profilePatch).eq("id", userId);
      profileError = retry.error;
    }
    if (profileError) {
      logSignupEvent({
        fn: "register-user",
        request_id: requestId,
        step: "profile_update",
        stand_number: standForLog,
        phone_last4: phoneLast4(phoneForLog),
        email_domain: emailDomain(emailForLog),
        status: 0,
        error_code: profileError.code ?? "profile_update_failed",
        error_message: profileError.message,
      });
    }

    step = "twilio";
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      return respond(500, "verification_not_configured", {
        success: false,
        error: "Verification service not configured. Please contact support.",
      });
    }

    const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
    let deliveryChannel = "whatsapp";

    let twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: new URLSearchParams({
        To: trimmedPhone,
        Channel: "whatsapp",
      }),
    });

    let twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      logSignupEvent({
        fn: "register-user",
        request_id: requestId,
        step: "twilio_whatsapp",
        stand_number: standForLog,
        phone_last4: phoneLast4(phoneForLog),
        email_domain: emailDomain(emailForLog),
        status: twilioResponse.status,
        error_code: "twilio_whatsapp_failed",
        error_message: twilioSummary(twilioData),
      });
      deliveryChannel = "sms";

      twilioResponse = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
        body: new URLSearchParams({
          To: trimmedPhone,
          Channel: "sms",
        }),
      });

      twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        return respond(201, "verification_not_sent", {
          success: true,
          userId: userId,
          verificationSent: false,
          error: "Account created but failed to send verification code. Please try logging in.",
        }, twilioSummary(twilioData));
      }
    }

    const maskedPhone = trimmedPhone.replace(/(\+\d{1,3})(\d+)(\d{4})$/, "$1****$3");
    step = "done";
    return respond(201, "account_created", {
      success: true,
      userId: userId,
      email: authEmail,
      phoneNumber: maskedPhone,
      channel: deliveryChannel,
      verificationSent: true,
      message: `Account created! Verification code sent via ${deliveryChannel === "whatsapp" ? "WhatsApp" : "SMS"}.`,
    });
  } catch (error: unknown) {
    step = step === "parse" ? "parse" : step;
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return respond(500, "unexpected", { success: false, error: "An unexpected error occurred" }, message);
  }
};

serve(handler);
