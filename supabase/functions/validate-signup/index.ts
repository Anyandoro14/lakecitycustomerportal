import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  listCollectionScheduleDataTabTitles,
  parseCollectionScheduleTabMonths,
  DEFAULT_PAYMENT_PLAN_MONTHS,
} from "../_shared/collection-schedule-sheets.ts";
import { checkStandPortalEnrolled, resolveTenantId } from "../_shared/portal-enrollment.ts";
import { ensureStandContractFromSchedule, enrolViaOdooThenRecheck } from "../_shared/odoo-ensure-contract.ts";
import {
  emailDomain,
  logSignupEvent,
  normalizeSignupPhone,
  phoneLast4,
  readSignupText,
  signupPhonesMatch,
  signupStandsMatch,
  type SignupLogEvent,
} from "../_shared/signup-flow.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateSignupRequest {
  standNumber: string;
  phoneNumber: string;
}

// Rate limiting: max 5 validation attempts per phone per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const validationAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Helper functions for JWT signing
const base64url = (str: string) => {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const extractPemBase64 = (pem: string) => {
  const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
  const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
  const body = match ? match[1] : normalized;
  let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  else if (pad === 1) throw new Error('Invalid base64 length');
  return base64;
};

// Clean up old rate limit entries periodically
const cleanupRateLimits = () => {
  const now = Date.now();
  for (const [key, value] of validationAttempts.entries()) {
    if (now - value.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      validationAttempts.delete(key);
    }
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  let step = "parse";
  let standForLog: string | null = null;
  let phoneForLog: string | null = null;
  let emailForLog: string | null = null;

  const respond = (
    code: string,
    body: Record<string, unknown>,
    errorMessage?: string | null,
  ) => {
    const event: SignupLogEvent = {
      fn: "validate-signup",
      request_id: requestId,
      step,
      stand_number: standForLog,
      phone_last4: phoneLast4(phoneForLog),
      email_domain: emailDomain(emailForLog),
      status: 200,
      error_code: code,
      error_message: errorMessage ?? (typeof body.error === "string" ? body.error : null),
    };
    logSignupEvent(event);
    return new Response(JSON.stringify({ ...body, code, request_id: requestId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  };

  try {
    const parsed = await req.json() as ValidateSignupRequest;
    const standNumber = readSignupText(parsed.standNumber);
    const phoneNumber = readSignupText(parsed.phoneNumber);

    // Input validation. These stay HTTP 200 so the existing client reads data.valid.
    step = "validate_input";
    if (!standNumber) {
      return respond("stand_required", { valid: false, error: "Stand number is required" });
    }

    if (!phoneNumber) {
      return respond("phone_required", { valid: false, error: "Phone number is required" });
    }

    const trimmedStand = standNumber.trim();
    const trimmedPhone = phoneNumber.trim();
    standForLog = trimmedStand;
    phoneForLog = trimmedPhone;

    if (trimmedStand.length === 0 || trimmedStand.length > 50) {
      return respond("stand_invalid", { valid: false, error: "Invalid stand number format" });
    }

    // Validate phone number format. Unchanged: a local 0-prefix is rejected here
    // and only the sheet value is rewritten to +263 during comparison below.
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return respond("phone_invalid", { valid: false, error: "Invalid phone number format" });
    }

    // Rate limiting check
    cleanupRateLimits();
    const rateLimitKey = trimmedPhone;
    const attemptRecord = validationAttempts.get(rateLimitKey);
    
    if (attemptRecord) {
      if (Date.now() - attemptRecord.firstAttempt < RATE_LIMIT_WINDOW_MS) {
        if (attemptRecord.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          step = "rate_limit";
          return respond("rate_limited", { valid: false, error: "Too many attempts. Please try again later." });
        }
        attemptRecord.count++;
      } else {
        validationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
      }
    } else {
      validationAttempts.set(rateLimitKey, { count: 1, firstAttempt: Date.now() });
    }

    step = "profile_lookup";

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Extract tenant_id from JWT app_metadata
    const authHeader = req.headers.get('Authorization');
    let tenantId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const userToken = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabaseAdmin.auth.getUser(userToken);
      const appMeta = userData?.user?.app_metadata as { tenant_id?: string } | undefined;
      tenantId = appMeta?.tenant_id;
    }

    // Live profiles has no tenant_id. Select only columns that exist there.
    const existingProfileResult = await supabaseAdmin
      .from('profiles')
      .select('id, stand_number')
      .eq('stand_number', trimmedStand)
      .maybeSingle();
    if (existingProfileResult.error) {
      return respond("profile_lookup_failed", {
        valid: false,
        error: "We couldn't check whether this stand already has an account. Please try again.",
      }, existingProfileResult.error.message);
    }
    const existingProfile = existingProfileResult.data;

    if (existingProfile) {
      return respond("stand_already_registered", {
        valid: false,
        error: "An account already exists for this stand number. Please login instead.",
        existingAccount: true,
      });
    }

    // Look up stand number and phone in Google Sheets
    step = "sheets";

    const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
    const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
    
    let privateKeyPem: string;
    let serviceAccountEmail: string;
    
    try {
      const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
      privateKeyPem = credentials.private_key;
      serviceAccountEmail = credentials.client_email;
    } catch {
      privateKeyPem = keyString;
      serviceAccountEmail = clientEmail;
    }

    if (!serviceAccountEmail) {
      return respond("sheets_not_configured", { valid: false, error: "Server configuration error" });
    }

    // Create JWT for Google Sheets API
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const jwtHeader = base64url(JSON.stringify(header));
    const jwtClaimSet = base64url(JSON.stringify(claimSet));
    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

    const base64Key = extractPemBase64(privateKeyPem);
    const raw = atob(base64Key);
    const buffer = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(signatureInput)
    );

    const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      return respond("sheets_auth_failed", { valid: false, error: "Failed to verify credentials" }, `google token status ${tokenResponse.status}`);
    }

    const { access_token } = await tokenResponse.json();

    const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
    if (!spreadsheetId) {
      return respond("sheets_not_configured", { valid: false, error: "Server configuration error" }, "SPREADSHEET_ID is not set");
    }

    // Fetch spreadsheet data
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!metadataResponse.ok) {
      return respond("sheets_auth_failed", { valid: false, error: "Failed to verify credentials" }, `spreadsheet metadata status ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];

    const tabTitles = listCollectionScheduleDataTabTitles(sheets);
    const titlesToScan = tabTitles.length > 0 ? tabTitles : [sheets[0]?.properties?.title || "Sheet1"];

    let rows: string[][] = [];
    let matchedPlanMonths = DEFAULT_PAYMENT_PLAN_MONTHS;
    for (const sheetTitle of titlesToScan) {
      const range = encodeURIComponent(`${sheetTitle}!A:AZ`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const part = data.values || [];
      if (part.length < 2) continue;

      const headers = part[0];
      const standNumIndex = headers.findIndex(
        (h: string) => h && h.toString().toLowerCase().includes("stand"),
      );
      if (standNumIndex === -1) continue;

      const hit = part.slice(1).find(
        (row: string[]) =>
          row[standNumIndex] &&
          signupStandsMatch(row[standNumIndex].toString(), trimmedStand),
      );
      if (hit) {
        rows = part;
        const fromTitle = parseCollectionScheduleTabMonths(sheetTitle);
        if (fromTitle != null) matchedPlanMonths = fromTitle;
        break;
      }
    }

    if (rows.length === 0) {
      return respond("stand_not_found", { valid: false, error: "Stand number not found in our records" });
    }

    step = "enrollment";
    let portalCheck = await checkStandPortalEnrolled(supabaseAdmin, tenantId, trimmedStand);
    if (!portalCheck.enrolled) {
      // Account creation: ask Odoo to build the loan contract from the stand's
      // 36mo/48mo Collection Schedule row (phone must match), then re-check.
      const tid = await resolveTenantId(supabaseAdmin, tenantId);
      if (tid) {
        const { enrolled, ensure } = await enrolViaOdooThenRecheck(
          () => ensureStandContractFromSchedule(supabaseAdmin, tid, trimmedStand, trimmedPhone),
          async () => (await checkStandPortalEnrolled(supabaseAdmin, tid, trimmedStand)).enrolled,
        );
        logSignupEvent({
          fn: "validate-signup",
          request_id: requestId,
          step: "enrollment_odoo",
          stand_number: standForLog,
          phone_last4: phoneLast4(phoneForLog),
          email_domain: null,
          status: 200,
          error_code: enrolled ? null : "not_enrolled",
          error_message: `outcome=${ensure.outcome}`,
        });
        if (enrolled) portalCheck = { enrolled: true };
      }
    }
    if (!portalCheck.enrolled) {
      return respond("not_enrolled", { valid: false, error: portalCheck.message });
    }

    // Find column indices
    const headers = rows[0];
    const standNumIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('stand'));
    const phoneIndex = headers.findIndex((h: string) => {
      const header = h?.toString().toLowerCase().trim() || '';
      return header.includes('phone') || header.includes('contact');
    });
    const emailIndex = headers.findIndex((h: string) => h && h.toString().toLowerCase().includes('email'));

    if (standNumIndex === -1) {
      return respond("sheets_shape_invalid", { valid: false, error: "Data source configuration error" });
    }

    // Find the row with matching stand number (case-insensitive)
    step = "phone_match";
    const customerRow = rows.slice(1).find((row: string[]) =>
      row[standNumIndex] && signupStandsMatch(row[standNumIndex].toString(), trimmedStand)
    );

    if (!customerRow) {
      return respond("stand_not_found", {
        valid: false,
        error: "Stand number not found in our records. Please contact support.",
      });
    }

    // Check phone column if it exists (optional validation)
    // IMPORTANT: Store the authoritative sheet phone number to return later
    let authoritativePhoneNumber = trimmedPhone; // Default to user input if no sheet phone

    if (phoneIndex !== -1) {
      const sheetPhone = customerRow[phoneIndex]?.toString().trim() || '';

      if (sheetPhone) {
        if (!signupPhonesMatch(sheetPhone, trimmedPhone)) {
          return respond("phone_mismatch", {
            valid: false,
            error: "The phone number does not match our records for this stand number. Please check and try again.",
          }, `sheet_last4=${phoneLast4(sheetPhone) ?? "none"} input_last4=${phoneLast4(trimmedPhone) ?? "none"}`);
        }

        // Use the authoritative sheet phone number, not user input.
        // normalizeSignupPhone turns a leading 0 into +263 and strips spaces.
        authoritativePhoneNumber = normalizeSignupPhone(sheetPhone);
        phoneForLog = authoritativePhoneNumber;
      }
    }

    // Get email if available (optional)
    const email = emailIndex !== -1 ? customerRow[emailIndex]?.toString().trim() : null;
    emailForLog = email;

    step = "done";
    return respond("verified", {
      valid: true,
      standNumber: trimmedStand,
      phoneNumber: authoritativePhoneNumber,
      email: email || null,
      paymentPlanMonths: matchedPlanMonths,
      message: "Stand number and phone number verified successfully",
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    step = "unexpected";
    return respond("unexpected", { valid: false, error: "An unexpected error occurred" }, message);
  }
};

serve(handler);
