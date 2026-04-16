import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Auto-provision portal accounts for stands on the Collection Schedule
 * that don't yet have a portal account.
 *
 * Scans all Collection Schedule tabs, finds stands with an email but no
 * matching profile, creates an auth user with a random temp password,
 * and (optionally) emails the credentials via Resend.
 */

// ── Google auth helpers (mirrors fetch-google-sheets) ────────────────
async function getGoogleAccessToken(): Promise<string> {
  const keyString = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "";
  const clientEmail = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";

  let privateKeyPem: string;
  let serviceAccountEmail: string;

  // Try parsing as JSON first (same as fetch-google-sheets)
  try {
    const credentials = JSON.parse(keyString.replace(/\\n/g, "\n"));
    privateKeyPem = credentials.private_key;
    serviceAccountEmail = credentials.client_email;
  } catch {
    privateKeyPem = keyString;
    serviceAccountEmail = clientEmail;
  }

  if (!privateKeyPem || !serviceAccountEmail) {
    throw new Error("Missing Google service account credentials");
  }

  const now = Math.floor(Date.now() / 1000);

  const base64url = (str: string) =>
    btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwtHeader = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaimSet = base64url(JSON.stringify({
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;

  // Clean and prepare the private key PEM
  const extractPemBase64 = (pem: string) => {
    const normalized = (pem || "").toString().replace(/\r/g, "").replace(/\\n/g, "\n");
    const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
    const body = match ? match[1] : normalized;
    let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, "").replace(/\n/g, "");
    const pad = base64.length % 4;
    if (pad === 2) base64 += "==";
    else if (pad === 3) base64 += "=";
    return base64;
  };

  const base64Key = extractPemBase64(privateKeyPem);
  const raw = atob(base64Key);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8", buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey,
    new TextEncoder().encode(signatureInput),
  );
  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(sig)));

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtHeader}.${jwtClaimSet}.${sigB64}`,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

// ── Tab detection (mirrors collection-schedule-sheets.ts logic) ──
const TAB_REGEX = /^Collection Schedule/i;
function isCollectionScheduleTab(title: string): boolean {
  return TAB_REGEX.test(title) && title !== "TEMPLATE_INSTRUCTIONS";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Optional: verify caller is internal admin
    const authHeader = req.headers.get("Authorization");
    let tenantId: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      tenantId = user?.app_metadata?.tenant_id;
    }

    // Parse optional body
    let dryRun = false;
    let filterStand: string | null = null;
    try {
      const body = await req.json();
      dryRun = body.dryRun === true;
      if (body.filterStand) filterStand = body.filterStand.toString().trim().toUpperCase();
    } catch { /* no body */ }

    // Resolve spreadsheet ID
    let spreadsheetId: string | null = null;
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from("tenants")
        .select("spreadsheet_id")
        .eq("id", tenantId)
        .maybeSingle();
      spreadsheetId = data?.spreadsheet_id || null;
    }
    if (!spreadsheetId) {
      spreadsheetId = Deno.env.get("SPREADSHEET_ID") || null;
    }
    if (!spreadsheetId) {
      return new Response(JSON.stringify({ error: "No spreadsheet configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Google access token
    const accessToken = await getGoogleAccessToken();

    // Get spreadsheet metadata
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) throw new Error(`Sheets metadata: ${metaRes.status}`);
    const meta = await metaRes.json();
    const sheets = (meta.sheets || []) as { properties: { title: string } }[];

    const tabs = sheets
      .map((s) => s.properties.title)
      .filter((t) => isCollectionScheduleTab(t) && t !== "Receipts_Intake" && t !== "Payments_Ledger");

    console.log(`Scanning ${tabs.length} tab(s): ${tabs.join(", ")}`);

    // Collect all stands from all tabs
    type SheetStand = {
      standNumber: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
      tabTitle: string;
    };
    const allStands: SheetStand[] = [];

    for (const tab of tabs) {
      const range = encodeURIComponent(`${tab}!A:K`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) { console.warn(`Failed to fetch tab "${tab}"`); continue; }
      const data = await res.json();
      const rows: string[][] = data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0];
      const standIdx = headers.findIndex((h: string) => h?.toLowerCase().includes("stand"));
      const emailIdx = headers.findIndex((h: string) => h?.toLowerCase().includes("email"));
      const firstIdx = headers.findIndex((h: string) => h?.toLowerCase().includes("first"));
      const lastIdx = headers.findIndex((h: string) => h?.toLowerCase().includes("last"));
      const phoneIdx = headers.findIndex((h: string) =>
        h?.toLowerCase().includes("phone") || h?.toLowerCase().includes("contact"),
      );

      if (standIdx === -1 || emailIdx === -1) continue;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sn = row[standIdx]?.toString().trim();
        const email = row[emailIdx]?.toString().trim().toLowerCase();
        if (!sn || !email) continue;
        // Skip placeholder / obviously invalid emails
        if (email.endsWith("@lakecity.portal") || email.includes("placeholder")) continue;

        allStands.push({
          standNumber: sn.toUpperCase(),
          email,
          firstName: firstIdx !== -1 ? (row[firstIdx]?.toString().trim() || "") : "",
          lastName: lastIdx !== -1 ? (row[lastIdx]?.toString().trim() || "") : "",
          phone: phoneIdx !== -1 ? (row[phoneIdx]?.toString().trim() || "") : "",
          tabTitle: tab,
        });
      }
    }

    // Deduplicate by stand number (first occurrence wins)
    const seen = new Set<string>();
    const unique: SheetStand[] = [];
    for (const s of allStands) {
      if (seen.has(s.standNumber)) continue;
      seen.add(s.standNumber);
      unique.push(s);
    }

    console.log(`Found ${unique.length} unique stands with emails on sheet`);

    // Get all existing profiles with stand numbers
    const { data: existingProfiles } = await supabaseAdmin
      .from("profiles")
      .select("stand_number")
      .not("stand_number", "is", null);

    const existingStands = new Set(
      (existingProfiles || []).map((p: any) => p.stand_number?.toString().trim().toUpperCase()),
    );

    // Filter to stands that need provisioning
    let candidates = unique.filter((s) => !existingStands.has(s.standNumber));
    // If a specific stand was requested, narrow down
    if (filterStand) {
      candidates = candidates.filter((s) => s.standNumber === filterStand);
    }
    const toProvision = candidates;
    console.log(`${toProvision.length} stand(s) need provisioning`);

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        totalOnSheet: unique.length,
        alreadyProvisioned: unique.length - toProvision.length,
        toProvision: toProvision.map((s) => ({
          standNumber: s.standNumber,
          email: s.email,
          name: `${s.firstName} ${s.lastName}`.trim(),
        })),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Provision each stand
    const results: { standNumber: string; email: string; status: string; error?: string }[] = [];
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    for (const stand of toProvision) {
      try {
        const tempPassword = generatePassword();
        const fullName = `${stand.firstName} ${stand.lastName}`.trim();

        // Check if email already exists in auth
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users?.users.find(
          (u: any) => u.email?.toLowerCase() === stand.email,
        );

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
          // Update profile with stand number
          await supabaseAdmin.from("profiles").update({
            stand_number: stand.standNumber,
            phone_number: stand.phone || null,
            email: stand.email,
            full_name: fullName || null,
            ...(tenantId ? { tenant_id: tenantId } : {}),
          }).eq("id", userId);

          await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword });
        } else {
          // Create new auth user
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: stand.email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              stand_number: stand.standNumber,
              phone_number: stand.phone,
              full_name: fullName,
            },
          });

          if (authError) {
            results.push({ standNumber: stand.standNumber, email: stand.email, status: "error", error: authError.message });
            continue;
          }

          userId = authData.user.id;

          // Update profile
          const { error: profileErr } = await supabaseAdmin.from("profiles").update({
            stand_number: stand.standNumber,
            phone_number: stand.phone || null,
            email: stand.email,
            full_name: fullName || null,
            ...(tenantId ? { tenant_id: tenantId } : {}),
          }).eq("id", userId);

          if (profileErr) {
            // Try insert if trigger didn't create it
            await supabaseAdmin.from("profiles").insert({
              id: userId,
              stand_number: stand.standNumber,
              phone_number: stand.phone || null,
              email: stand.email,
              full_name: fullName || null,
              ...(tenantId ? { tenant_id: tenantId } : {}),
            });
          }
        }

        // Send temp password via SMS (preferred) or email fallback
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER");
        const twilioMsgSvcSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");

        if (stand.phone && (twilioSid && twilioAuth)) {
          // Normalize phone to E.164
          let phone = stand.phone.replace(/\s+/g, "");
          if (!phone.startsWith("+")) phone = `+${phone}`;

          const smsBody = `StandLedger Portal\n\nYour account has been created for Stand ${stand.standNumber}.\n\nEmail: ${stand.email}\nTemp Password: ${tempPassword}\n\nLogin: lakecity.standledger.io\nPlease change your password after login.`;

          try {
            const smsParams: Record<string, string> = {
              To: phone,
              Body: smsBody,
            };
            if (twilioMsgSvcSid) {
              smsParams.MessagingServiceSid = twilioMsgSvcSid;
            } else if (twilioFrom) {
              smsParams.From = twilioFrom;
            }

            const smsRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
                },
                body: new URLSearchParams(smsParams),
              },
            );

            if (!smsRes.ok) {
              const smsErr = await smsRes.json();
              console.warn(`SMS failed for ${stand.phone}: ${smsErr.message || smsRes.status}`);
            } else {
              console.log(`SMS sent to ${stand.phone} for Stand ${stand.standNumber}`);
            }
          } catch (smsErr) {
            console.warn(`SMS error for ${stand.phone}:`, smsErr);
          }
        } else if (resendApiKey) {
          // Fallback to email if no phone or Twilio not configured
          try {
            const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
            const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

            const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableApiKey}`,
                "X-Connection-Api-Key": resendApiKey,
              },
              body: JSON.stringify({
                from: "StandLedger <noreply@lakecity.co.zw>",
                to: [stand.email],
                subject: "Your StandLedger Portal Account",
                html: `
                  <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                    <h1 style="font-family: 'Playfair Display', serif; color: #1a1a2e;">Welcome to StandLedger</h1>
                    <p>Dear ${fullName || "Valued Customer"},</p>
                    <p>Your portal account has been created for Stand <strong>${stand.standNumber}</strong>.</p>
                    <p>Login credentials:</p>
                    <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                      <p style="margin: 4px 0;"><strong>Email:</strong> ${stand.email}</p>
                      <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
                    </div>
                    <p>Log in at <a href="https://lakecity.standledger.io">lakecity.standledger.io</a> and change your password.</p>
                  </div>
                `,
              }),
            });

            if (!emailRes.ok) {
              console.warn(`Email failed for ${stand.email}: ${emailRes.status}`);
            }
          } catch (emailErr) {
            console.warn(`Email error for ${stand.email}:`, emailErr);
          }
        }

        results.push({ standNumber: stand.standNumber, email: stand.email, status: "created" });
        console.log(`✓ Provisioned: Stand ${stand.standNumber} → ${stand.email}`);

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to provision Stand ${stand.standNumber}:`, err);
        results.push({
          standNumber: stand.standNumber,
          email: stand.email,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const errors = results.filter((r) => r.status === "error").length;

    return new Response(JSON.stringify({
      summary: { totalOnSheet: unique.length, alreadyProvisioned: unique.length - toProvision.length, created, errors },
      results,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
