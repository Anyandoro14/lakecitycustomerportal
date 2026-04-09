import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import {
  resolveCollectionScheduleSheetTitle,
} from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleSheetsResponse {
  values: string[][];
}

// Interface for individual receipt records from Receipts_Intake
interface ReceiptRecord {
  intake_id: string;
  timestamp: string;
  stand_number: string;
  customer_name: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference: string;
  intake_status: string;
}

// Parse currency string to number
const parseCurrencyValue = (val: string): number => {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Fetch posted receipts from Receipts_Intake sheet for a list of stand numbers
async function fetchPostedReceipts(accessToken: string, standNumbers: string[], spreadsheetId: string): Promise<Map<string, ReceiptRecord[]>> {
  if (!spreadsheetId) {
    console.log('No spreadsheet_id for receipts fetch');
    return new Map();
  }

  try {
    // Get metadata to find Receipts_Intake sheet
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataResponse.ok) {
      console.log('Could not fetch metadata for receipts');
      return new Map();
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];
    const receiptsSheet = sheets.find((s: any) => s.properties.title === 'Receipts_Intake');

    if (!receiptsSheet) {
      console.log('Receipts_Intake sheet not found - falling back to column-based dates');
      return new Map();
    }

    const sheetTitle = receiptsSheet.properties.title;
    console.log(`Fetching receipts from: "${sheetTitle}"`);

    // Fetch all receipts
    const range = encodeURIComponent(`${sheetTitle}!A:L`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.log('Could not fetch Receipts_Intake data');
      return new Map();
    }

    const data: GoogleSheetsResponse = await response.json();
    const rows = data.values || [];
    
    console.log(`Fetched ${rows.length} receipt rows`);

    if (rows.length < 2) {
      return new Map();
    }

    // Column indices for Receipts_Intake
    const COL_INTAKE_ID = 0;
    const COL_TIMESTAMP = 1;
    const COL_STAND_NUMBER = 2;
    const COL_CUSTOMER_NAME = 3;
    const COL_PAYMENT_DATE = 4;
    const COL_PAYMENT_AMOUNT = 5;
    const COL_PAYMENT_METHOD = 6;
    const COL_REFERENCE = 7;
    const COL_INTAKE_STATUS = 10;

    // Build map of stand_number -> receipts (only Posted receipts)
    const receiptsMap = new Map<string, ReceiptRecord[]>();
    const standNumberSet = new Set(standNumbers.map(s => s.toUpperCase()));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const standNumber = row[COL_STAND_NUMBER]?.toString().trim().toUpperCase() || '';
      const intakeStatus = row[COL_INTAKE_STATUS]?.toString().trim() || '';
      
      // Only include Posted receipts for stands we're interested in
      if (!standNumberSet.has(standNumber)) continue;
      if (intakeStatus !== 'Posted') continue;
      
      const paymentAmount = parseCurrencyValue(row[COL_PAYMENT_AMOUNT]?.toString() || '');
      if (paymentAmount <= 0) continue;

      const receipt: ReceiptRecord = {
        intake_id: row[COL_INTAKE_ID]?.toString().trim() || `ROW_${i + 1}`,
        timestamp: row[COL_TIMESTAMP]?.toString().trim() || '',
        stand_number: standNumber,
        customer_name: row[COL_CUSTOMER_NAME]?.toString().trim() || '',
        payment_date: row[COL_PAYMENT_DATE]?.toString().trim() || '',
        payment_amount: paymentAmount,
        payment_method: row[COL_PAYMENT_METHOD]?.toString().trim() || '',
        reference: row[COL_REFERENCE]?.toString().trim() || '',
        intake_status: intakeStatus
      };

      if (!receiptsMap.has(standNumber)) {
        receiptsMap.set(standNumber, []);
      }
      receiptsMap.get(standNumber)!.push(receipt);
    }

    // Sort receipts by payment date (most recent first)
    for (const [stand, receipts] of receiptsMap) {
      receipts.sort((a, b) => {
        const dateA = new Date(a.payment_date);
        const dateB = new Date(b.payment_date);
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
    }

    console.log(`Built receipts map for ${receiptsMap.size} stands`);
    return receiptsMap;

  } catch (error) {
    console.error('Error fetching receipts:', error);
    return new Map();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Extract JWT token from authorization header
    const userToken = authHeader.replace('Bearer ', '');

    // Verify the JWT and get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(userToken);
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for Looking Glass mode and tenant_id
    let lookingGlassMode = false;
    let targetStandNumber = null;
    let requestBody: any = {};

    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        lookingGlassMode = requestBody.lookingGlassMode === true;
        targetStandNumber = requestBody.targetStandNumber;
      }
    } catch (e) {
      // No body or invalid JSON, continue with normal flow
    }

    // Resolve spreadsheet_id: prefer tenant_id lookup, fall back to env var
    let spreadsheetId: string | null = null;
    const requestTenantId = requestBody.tenant_id;

    if (requestTenantId) {
      const { data: tenant, error: tenantError } = await supabaseClient
        .from('tenants')
        .select('spreadsheet_id')
        .eq('id', requestTenantId)
        .single();

      if (tenantError) {
        console.warn('Tenant lookup failed, falling back to env var:', tenantError.message);
      } else if (tenant?.spreadsheet_id) {
        spreadsheetId = tenant.spreadsheet_id;
        console.log(`Using spreadsheet_id from tenant ${requestTenantId}`);
      }
    }

    // Fallback to environment variable for backwards compatibility
    if (!spreadsheetId) {
      spreadsheetId = Deno.env.get('SPREADSHEET_ID') || null;
    }

    // Get user's profile (include stand_number for fallback matching)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('email, stand_number, payment_plan_months')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize + match against BOTH auth email and profile email (supports email migrations)
    const normalizeEmail = (value: unknown) =>
      (value ?? "")
        .toString()
        .trim()
        .toLowerCase()
        // remove any whitespace characters that can sneak into sheets / profiles
        .replace(/\s+/g, "");

    const candidateEmails = Array.from(
      new Set([profile.email, user.email].map(normalizeEmail).filter(Boolean)),
    );

    // Get stand number from profile for fallback matching (for placeholder emails like stand-xxx@lakecity.portal)
    const profileStandNumber = profile.stand_number?.toString().trim().toUpperCase() || null;

    // Check if user has a placeholder email (meaning we should match by stand number instead)
    const hasPlaceholderEmail = candidateEmails.every(e => 
      e.endsWith('@lakecity.portal') || e.includes('placeholder')
    );

    if (candidateEmails.length === 0 && !profileStandNumber) {
      return new Response(
        JSON.stringify({ error: "User email not available" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const primaryEmail = candidateEmails[0] || 'unknown';
    console.log('Fetching data for user:', {
      authEmail: user.email,
      profileEmail: profile.email,
      candidateEmails,
      profileStandNumber,
      hasPlaceholderEmail,
    });

    // Check if this is Looking Glass mode - only allow for @lakecity.co.zw admins
    let isLookingGlassAdmin = false;
    if (lookingGlassMode && targetStandNumber) {
      const isStaff = candidateEmails.some((e) => e.endsWith('@lakecity.co.zw'));

      if (isStaff) {
        // Verify user is an internal user
        const { data: internalUser } = await supabaseClient
          .from('internal_users')
          .select('id, role')
          .eq('user_id', user.id)
          .single();

        if (internalUser) {
          isLookingGlassAdmin = true;
          console.log(`Looking Glass mode activated by ${primaryEmail} for stand ${targetStandNumber}`);
        } else {
          console.warn(`Looking Glass denied - user ${primaryEmail} not in internal_users table`);
        }
      } else {
        console.warn(`Looking Glass denied - user ${primaryEmail} not @lakecity.co.zw`);
      }
    }

    let paymentPlanMonthsForSchedule: number | null =
      profile.payment_plan_months != null && profile.payment_plan_months > 0
        ? Math.round(Number(profile.payment_plan_months))
        : null;

    if (lookingGlassMode && targetStandNumber && isLookingGlassAdmin) {
      const { data: targetProfileRow } = await supabaseClient
        .from("profiles")
        .select("payment_plan_months")
        .ilike("stand_number", targetStandNumber.trim())
        .maybeSingle();
      if (targetProfileRow?.payment_plan_months != null && targetProfileRow.payment_plan_months > 0) {
        paymentPlanMonthsForSchedule = Math.round(Number(targetProfileRow.payment_plan_months));
      }
    }

    // Get credentials - support both JSON and separate key/email
    const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
    const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
    
    let privateKeyPem: string;
    let serviceAccountEmail: string;
    
    // Try parsing as JSON first
    try {
      const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
      privateKeyPem = credentials.private_key;
      serviceAccountEmail = credentials.client_email;
    } catch {
      // If not JSON, treat as raw private key
      privateKeyPem = keyString;
      serviceAccountEmail = clientEmail;
    }
    // Validate service account email format
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!serviceAccountEmail || !emailRegex.test(serviceAccountEmail)) {
      console.error('Invalid or missing service account email');
      return new Response(
        JSON.stringify({ error: 'Invalid service account email. Re-upload full JSON key or set GOOGLE_CLIENT_EMAIL.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };
    
    // Base64url encode (not regular base64)
    const base64url = (str: string) => {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };
    
    const jwtHeader = base64url(JSON.stringify(header));
    const jwtClaimSet = base64url(JSON.stringify(claimSet));
    const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
    
    // Clean and prepare the private key (support PEM with or without headers)
    const extractPemBase64 = (pem: string) => {
      const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
      const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
      const body = match ? match[1] : normalized; // if no headers, assume it's the raw body
      // Remove any characters not allowed in base64
      let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
      // Add padding if missing
      const pad = base64.length % 4;
      if (pad === 2) base64 += '==';
      else if (pad === 3) base64 += '=';
      else if (pad === 1) throw new Error('Invalid base64 length');
      return base64;
    };

    const base64Key = extractPemBase64(privateKeyPem);

    // Import the private key
    let buffer: ArrayBuffer;
    try {
      const raw = atob(base64Key);
      buffer = new ArrayBuffer(raw.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    } catch (e) {
      console.error('Failed to base64-decode private key');
      return new Response(JSON.stringify({ error: 'Invalid private key format. Please re-upload the key.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the JWT
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(signatureInput)
    );

    const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${jwtHeader}.${jwtClaimSet}.${signatureBase64}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return new Response(
        JSON.stringify({ error: `Failed to get access token: ${errorData}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token } = await tokenResponse.json();
    console.log('Successfully obtained access token');

    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: 'No spreadsheet configured for this tenant. Set spreadsheet_id on the tenant or SPREADSHEET_ID env var.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, get spreadsheet metadata to determine the sheet title
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Metadata fetch error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: `Google Sheets API error (${metadataResponse.status}). Check: 1) Spreadsheet ID is correct, 2) Sheet is shared with ${serviceAccountEmail} as Viewer` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const metadata = await metadataResponse.json();
    const sheets = metadata.sheets || [];

    const resolved = resolveCollectionScheduleSheetTitle(sheets, {
      paymentPlanMonths: paymentPlanMonthsForSchedule,
      envPreferredName: Deno.env.get('SHEET_NAME'),
      envPreferredGid: Deno.env.get('SHEET_GID'),
    });

    const sheetExists = sheets.some((s: any) => s.properties?.title === resolved.sheetTitle);
    if (!sheetExists) {
      console.error(
        `Collection Schedule tab not found: expected "${resolved.sheetTitle}" (source=${resolved.source}).`,
      );
      return new Response(
        JSON.stringify({
          error:
            `Collection Schedule tab "${resolved.sheetTitle}" was not found in the spreadsheet. ` +
            `Rename the sheet or set profiles.payment_plan_months / SHEET_NAME.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const sheetTitle = resolved.sheetTitle;

    // Detect Payments_Ledger tab (row-based payments for tenants like Lake City)
    const hasPaymentsLedger = sheets.some((s: any) => s.properties.title === 'Payments_Ledger');
    console.log(
      `Using sheet: "${sheetTitle}" (payment_plan_months=${paymentPlanMonthsForSchedule ?? "default"}, source=${resolved.source}), hasPaymentsLedger: ${hasPaymentsLedger}`,
    );

    // Fetch full row width: identity A–L, monthly M–FX (repo templates), totals FY–GB, operational/agreement columns.
    // (Legacy layouts used A:BJ; widened BNPL grids need through ~FZ+ — A:ZZ avoids truncation.)
    const range = encodeURIComponent(`${sheetTitle}!A:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Sheets fetch error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: `Google Sheets API error (${response.status}). Check: 1) Spreadsheet ID is correct, 2) Sheet is shared with ${serviceAccountEmail} as Viewer` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: GoogleSheetsResponse = await response.json();
    const rows = data.values || [];
    
    console.log(`Fetched rows: ${rows.length}`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data found in spreadsheet' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find header row and get column indices
    const headers = rows[0];
    const standNumIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('stand'));
    const firstNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('first'));
    const lastNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('last'));
    const emailIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('email'));
    const customerCategoryIndex = 5; // Column F (0-indexed = 5) - Customer Category
    const phoneIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('phone') || h && h.toString().toLowerCase().includes('contact'));
    const totalPriceIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('total price'));
    const paymentIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('payment') && !h.toString().toLowerCase().includes('installment'));
    const startDateIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('start date'));
    const nextInstallmentIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('next installment'));
    const depositIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('deposit'));
    // VAT indicator - look for columns that might indicate VAT inclusion/exclusion
    const vatInclusiveIndex = headers.findIndex(h => h && (h.toString().toLowerCase().includes('vat') || h.toString().toLowerCase().includes('inclusive')));
    
    if (standNumIndex === -1) {
      return new Response(
        JSON.stringify({ error: 'Could not find "Stand Number" column in spreadsheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (emailIndex === -1) {
      return new Response(
        JSON.stringify({ error: 'Could not find "Email" column in spreadsheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find customer rows - different logic for Looking Glass vs normal mode
    let customerRows: string[][];
    
    if (isLookingGlassAdmin && targetStandNumber) {
      // Looking Glass mode: Find the specific stand by stand number
      customerRows = rows.slice(1).filter(row => 
        row[standNumIndex] && row[standNumIndex].toString().trim().toUpperCase() === targetStandNumber.toUpperCase()
      );
      console.log(`Looking Glass: Found ${customerRows.length} row(s) for stand ${targetStandNumber}`);
      
      if (customerRows.length === 0) {
        return new Response(
          JSON.stringify({ error: `Stand ${targetStandNumber} not found in spreadsheet` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Normal mode: Find ALL customer rows by matching email OR stand number from profile
      customerRows = rows.slice(1).filter((row) => {
        const rowEmail = normalizeEmail(row[emailIndex]);
        const rowStandNumber = row[standNumIndex]?.toString().trim().toUpperCase() || '';
        
        // Match by email if user has real email
        if (!hasPlaceholderEmail && rowEmail && candidateEmails.includes(rowEmail)) {
          return true;
        }
        
        // Match by stand number from profile (for users with placeholder emails)
        if (profileStandNumber && rowStandNumber === profileStandNumber) {
          return true;
        }
        
        return false;
      });

      if (customerRows.length === 0) {
        const matchCriteria = hasPlaceholderEmail && profileStandNumber 
          ? `stand number ${profileStandNumber}` 
          : `email (${primaryEmail})`;
        return new Response(
          JSON.stringify({
            error: `Your ${matchCriteria} is not authorized to view any stand. Please contact support.`,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`User ${primaryEmail} (stand: ${profileStandNumber || 'N/A'}) authorized for ${customerRows.length} stand(s)`);
    }

    // Fetch itemized receipts from Receipts_Intake for payment history
    // This provides actual receipt dates instead of column-position-based dates
    const standNumbersList = customerRows.map(row => row[standNumIndex]?.toString().trim().toUpperCase() || '').filter(Boolean);
    console.log(`Fetching receipts for ${standNumbersList.length} stand(s)...`);
    const receiptsMap = await fetchPostedReceipts(access_token, standNumbersList, spreadsheetId);
    console.log(`Receipts found for ${receiptsMap.size} stand(s)`);

    // Map all stands to data objects
    const stands = [];
    for (const customerRow of customerRows) {
      const standNumber = customerRow[standNumIndex];
      // Column M (index 12): first monthly instalment cell — used before start-date fallbacks below
      const paymentStartCol = 12;

      // Combine first and last name
      const firstName = firstNameIndex !== -1 ? (customerRow[firstNameIndex] || '') : '';
      const lastName = lastNameIndex !== -1 ? (customerRow[lastNameIndex] || '') : '';
      
      // Get Customer Category from Column F
      const customerCategory = customerRow[customerCategoryIndex]?.toString().trim() || '';
      
      // Get phone/contact number
      const phoneNumber = phoneIndex !== -1 ? (customerRow[phoneIndex]?.toString().trim() || '') : '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      // Get Total Price and Deposit
      const totalPrice = totalPriceIndex !== -1 ? (customerRow[totalPriceIndex]?.toString().trim() || '') : '';
      const deposit = depositIndex !== -1 ? (customerRow[depositIndex]?.toString().trim() || '') : '';
      
      // Determine VAT status - check if there's a VAT indicator column, otherwise default to null
      let isVatInclusive: boolean | null = null;
      if (vatInclusiveIndex !== -1) {
        const vatValue = customerRow[vatInclusiveIndex]?.toString().toLowerCase().trim() || '';
        if (vatValue.includes('inclusive') || vatValue.includes('incl') || vatValue === 'yes' || vatValue === 'true') {
          isVatInclusive = true;
        } else if (vatValue.includes('exclusive') || vatValue.includes('excl') || vatValue === 'no' || vatValue === 'false') {
          isVatInclusive = false;
        }
      }

      // Get the start date for this customer — prefer profiles.payment_start_date, then sheet column
      const startDateStr = startDateIndex !== -1 ? (customerRow[startDateIndex] || '') : '';
      let customerStartDate: Date | null = null;

      // First, try to get payment_start_date from profiles table (authoritative)
      const standKey_ = standNumber.toString().trim().toUpperCase();
      const { data: profileWithDate } = await supabaseClient
        .from('profiles')
        .select('payment_start_date')
        .ilike('stand_number', standKey_)
        .limit(1)
        .maybeSingle();

      if (profileWithDate?.payment_start_date) {
        customerStartDate = new Date(profileWithDate.payment_start_date);
        if (isNaN(customerStartDate.getTime())) customerStartDate = null;
      }

      // Fallback: parse from sheet column
      if (!customerStartDate && startDateStr) {
        try {
          const parsedDate = new Date(startDateStr);
          if (!isNaN(parsedDate.getTime())) {
            customerStartDate = parsedDate;
            customerStartDate.setDate(5);
          }
        } catch (e) {
          console.log(`Could not parse start date for stand ${standNumber}: ${startDateStr}`);
        }
      }

      // Final fallback: use sheet header date (no hardcoded 2025 date)
      if (!customerStartDate) {
        const headerDate = headers[paymentStartCol];
        if (headerDate) {
          const parsed = new Date(headerDate);
          if (!isNaN(parsed.getTime())) {
            customerStartDate = parsed;
          }
        }
      }

      // Last resort fallback
      if (!customerStartDate) {
        customerStartDate = new Date(2025, 8, 5);
        console.warn(`Stand ${standNumber}: No payment_start_date found, using fallback Sept 2025`);
      }

      console.log(`Stand ${standNumber}: Start date = ${customerStartDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);

      // BNPL: term from profile (12–120); monthly grid from Column M (index 12). Templates use a shared
      // calendar (e.g. Jan 2022–Dec 2035); do not read past the column before "Next Payment".
      const termMonths =
        paymentPlanMonthsForSchedule != null && paymentPlanMonthsForSchedule > 0
          ? Math.min(120, Math.max(1, Math.round(paymentPlanMonthsForSchedule)))
          : 36;

      const headerStr = (i: number) =>
        headers[i] != null ? String(headers[i]).trim() : "";

      const findHeaderCol = (pred: (s: string) => boolean): number => {
        for (let i = 0; i < headers.length; i++) {
          const s = headerStr(i);
          if (s && pred(s)) return i;
        }
        return -1;
      };

      const nextPaymentColIdx = findHeaderCol((s) => /next\s*payment/i.test(s));
      const termBasedEnd = paymentStartCol + termMonths - 1;
      const paymentEndCol =
        nextPaymentColIdx >= 0
          ? Math.min(termBasedEnd, nextPaymentColIdx - 1)
          : termBasedEnd;
      let totalPaidCol = findHeaderCol((s) => /total\s*paid/i.test(s));
      let currentBalanceCol = findHeaderCol((s) => /current\s*balance/i.test(s));
      let paymentProgressCol = findHeaderCol((s) => /payment\s*progress/i.test(s));

      if (totalPaidCol < 0 && nextPaymentColIdx >= 0) {
        totalPaidCol = nextPaymentColIdx + 1;
        currentBalanceCol = nextPaymentColIdx + 2;
        paymentProgressCol = nextPaymentColIdx + 3;
      } else if (totalPaidCol < 0) {
        totalPaidCol = paymentEndCol + 2;
        currentBalanceCol = paymentEndCol + 3;
        paymentProgressCol = paymentEndCol + 4;
      } else {
        if (currentBalanceCol < 0) currentBalanceCol = totalPaidCol + 1;
        if (paymentProgressCol < 0) paymentProgressCol = totalPaidCol + 2;
      }

      let agreementSignedByWarwickshireCol = findHeaderCol((s) =>
        /warwickshire|vendor/i.test(s) && /sign|agreement/i.test(s),
      );
      let agreementSignedByClientCol = findHeaderCol((s) =>
        /client/i.test(s) && /sign|agreement/i.test(s),
      );
      let agreementOfSaleFileCol = findHeaderCol((s) =>
        /agreement\s*of\s*sale|drive|file\s*link|google\s*drive/i.test(s),
      );
      if (agreementSignedByWarwickshireCol < 0) agreementSignedByWarwickshireCol = 58;
      if (agreementSignedByClientCol < 0) agreementSignedByClientCol = 59;
      if (agreementOfSaleFileCol < 0) agreementOfSaleFileCol = 61;

      console.log(`Stand ${standNumber}: Row has ${customerRow.length} columns`);
      console.log(`Stand ${standNumber}: Columns 40-50: ${JSON.stringify(customerRow.slice(40, 51))}`);

      // Base date for monthly payment columns comes from the header of column O (e.g. "5 November 2025")
      const firstPaymentHeader = headers[paymentStartCol];
      let basePaymentDate = customerStartDate;
      if (firstPaymentHeader) {
        const parsedHeaderDate = new Date(firstPaymentHeader);
        if (!isNaN(parsedHeaderDate.getTime())) {
          basePaymentDate = parsedHeaderDate;
        }
      }
      
      const monthlyPayment = paymentIndex !== -1 ? (customerRow[paymentIndex] || '$0.00') : '$0.00';
      const sheetTotalPaid = customerRow[totalPaidCol] || '$0.00';
      const currentBalance = customerRow[currentBalanceCol] || '$0.00';
      const paymentProgress = customerRow[paymentProgressCol] || '0%';
      
      console.log(`Stand ${standNumber}: Sheet Total Paid (col ${totalPaidCol}) = ${sheetTotalPaid}, Current Balance (col ${currentBalanceCol}) = ${currentBalance}, Progress (col ${paymentProgressCol}) = ${paymentProgress}`);
      
      // Extract payment columns and build payment history
      const paymentColumns = [];
      // Extended payment history type that includes reference and method for itemized receipts
      const paymentHistory: Array<{
        date: string;
        amount: string;
        principal: string;
        interest: string;
        vat: string;
        total: string;
        reference?: string;
        payment_method?: string;
      }> = [];
      
      for (let i = paymentStartCol; i <= paymentEndCol; i++) {
        paymentColumns.push(customerRow[i] || '');
      }
      
      // Parse monthly payment amount from Column K (authoritative source for instalment size)
      const parseCurrencyToNumber = (val: string): number => {
        if (!val) return 0;
        const cleaned = val.toString().replace(/[$,\s]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };
      
      const monthlyPaymentAmount = parseCurrencyToNumber(monthlyPayment);
      console.log(`Stand ${standNumber}: Monthly payment (Column K) = ${monthlyPayment} = ${monthlyPaymentAmount}`);
      
      // Sum ALL payments made and track last payment for display
      let totalPaymentsSum = 0;
      let lastPaymentAmount = '';
      let lastPaymentDate = '';
      let lastPaymentIndex = -1;
      
      console.log(`Stand ${standNumber}: Processing ${paymentColumns.length} payment columns`);
      
      // Calculate totals from Collection Schedule columns (source of truth for balances)
      for (let i = 0; i < paymentColumns.length; i++) {
        if (paymentColumns[i] && paymentColumns[i].toString().trim() !== '') {
          const paymentValue = parseCurrencyToNumber(paymentColumns[i].toString());
          totalPaymentsSum += paymentValue;
          
          lastPaymentAmount = paymentColumns[i].toString();
          lastPaymentIndex = i;
          
          // Calculate date using base payment date from header row (fallback)
          const monthsFromStart = i;
          const paymentDate = new Date(basePaymentDate);
          paymentDate.setMonth(paymentDate.getMonth() + monthsFromStart);
          paymentDate.setDate(5); // BNPL: due dates on the 5th
          lastPaymentDate = paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      }

      // When no monthly cells are filled but deposit is paid, show deposit as last payment (not "No payments yet")
      const depositAmount = parseCurrencyToNumber(deposit);
      if (lastPaymentIndex === -1 && depositAmount > 0) {
        lastPaymentAmount = `$${depositAmount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
        lastPaymentDate = 'Initial Deposit';
      }
      const firstMonthPayment = parseCurrencyToNumber(paymentColumns[0]?.toString() || "");
      const expectedCombined = depositAmount + monthlyPaymentAmount;
      const isCombinedDepositInstallment =
        depositAmount > 0 &&
        monthlyPaymentAmount > 0 &&
        firstMonthPayment > 0 &&
        Math.abs(firstMonthPayment - expectedCombined) < 1;
      // Sheet TOTAL PAID formula: deposit + SUM(M:last) unless first month embeds deposit+instalment
      const totalPaidLikeSheet = isCombinedDepositInstallment ? totalPaymentsSum : totalPaymentsSum + depositAmount;

      // Build payment history from ITEMIZED RECEIPTS if available (preferred)
      // This shows actual receipt dates, not column-position dates
      const standKey = standNumber.toString().trim().toUpperCase();
      const itemizedReceipts = receiptsMap.get(standKey) || [];
      
      if (itemizedReceipts.length > 0) {
        console.log(`Stand ${standNumber}: Using ${itemizedReceipts.length} itemized receipts for payment history`);
        
        // Add deposit as first payment history entry if present
        const depositAmountForHistory = parseCurrencyToNumber(deposit);
        if (depositAmountForHistory > 0) {
          const depositAmountStr = `$${depositAmountForHistory.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          paymentHistory.push({
            date: 'Deposit',
            amount: depositAmountStr,
            principal: depositAmountStr,
            interest: '$0.00',
            vat: '$0.00',
            total: depositAmountStr,
            reference: 'Initial Deposit',
            payment_method: 'Deposit'
          });
        }
        
        for (const receipt of itemizedReceipts) {
          // Parse the actual receipt date
          let displayDate = receipt.payment_date;
          try {
            const receiptDate = new Date(receipt.payment_date);
            if (!isNaN(receiptDate.getTime())) {
              displayDate = receiptDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
          } catch (e) {
            // Keep original string if parsing fails
          }
          
          const amountStr = `$${receipt.payment_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          
          paymentHistory.push({
            date: displayDate,
            amount: amountStr,
            principal: amountStr,
            interest: '$0.00',
            vat: '$0.00',
            total: amountStr,
            reference: receipt.reference || undefined,
            payment_method: receipt.payment_method || undefined
          });
        }
        
        // Last payment card: use most recent posted receipt for both amount and date
        if (itemizedReceipts.length > 0) {
          const mostRecent = itemizedReceipts[0]; // Already sorted most recent first
          lastPaymentAmount = `$${mostRecent.payment_amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
          try {
            const receiptDate = new Date(mostRecent.payment_date);
            if (!isNaN(receiptDate.getTime())) {
              lastPaymentDate = receiptDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
          } catch (e) {
            // Keep column-based date as fallback
          }
        }
      } else {
        // Fallback: Build payment history from Collection Schedule columns
        // This is the legacy behavior for stands without receipts in Receipts_Intake
        console.log(`Stand ${standNumber}: No itemized receipts found, using column-based payment history`);
        
        // Add deposit as first payment history entry if present
        const depositAmountForHistory = parseCurrencyToNumber(deposit);
        if (depositAmountForHistory > 0) {
          const depositAmountStr = `$${depositAmountForHistory.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          paymentHistory.push({
            date: 'Deposit',
            amount: depositAmountStr,
            principal: depositAmountStr,
            interest: '$0.00',
            vat: '$0.00',
            total: depositAmountStr,
            reference: 'Initial Deposit',
            payment_method: 'Deposit'
          });
        }
        
        for (let i = 0; i < paymentColumns.length; i++) {
          if (paymentColumns[i] && paymentColumns[i].toString().trim() !== '') {
            const monthsFromStart = i;
            const paymentDate = new Date(basePaymentDate);
            paymentDate.setMonth(paymentDate.getMonth() + monthsFromStart);
            const dateStr = paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            
            paymentHistory.push({
              date: dateStr,
              amount: paymentColumns[i].toString(),
              principal: paymentColumns[i].toString(),
              interest: '$0.00',
              vat: '$0.00',
              total: paymentColumns[i].toString()
            });
          }
        }
      }
      
      // Total Paid / Current Balance / Payment Progress columns may be empty or show $0/0% when formulas are
      // missing; responses use deposit + monthly instalment cells and Total Price (not those cells alone).
      // Format calculated total to match sheet: deposit + instalment cells (see BNPL_SCHEDULE_SPEC.md)
      const calculatedTotalPaid = `$${totalPaidLikeSheet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const tpNum = parseCurrencyToNumber(totalPrice);
      // BNPL: remaining balance = Total price − (deposit + sum of monthly cells) = I − totalPaidLikeSheet
      const calculatedBalanceNum = Math.max(0, tpNum - totalPaidLikeSheet);
      const calculatedCurrentBalance = `$${calculatedBalanceNum.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      
      const sheetTotalNum = parseFloat(sheetTotalPaid.toString().replace(/[$,]/g, '')) || 0;
      if (Math.abs(sheetTotalNum - totalPaidLikeSheet) > 0.01) {
        console.warn(
          `Stand ${standNumber}: DISCREPANCY - Sheet TOTAL PAID ${sheetTotalPaid} (${sheetTotalNum}) vs computed ${calculatedTotalPaid} (${totalPaidLikeSheet})`,
        );
      }
      
      console.log(`Stand ${standNumber}: Calculated total = ${calculatedTotalPaid}, Sheet total = ${sheetTotalPaid}, Last payment index = ${lastPaymentIndex}`);
      
      const hasVerifiedDeposit = depositAmount > 0;
      console.log(`Stand ${standNumber}: Deposit = ${deposit} = ${depositAmount}, hasVerifiedDeposit = ${hasVerifiedDeposit}`);
      
      if (isCombinedDepositInstallment) {
        console.log(`Stand ${standNumber}: COMBINED DEPOSIT — Column M ($${firstMonthPayment}) ≈ Deposit ($${depositAmount}) + Instalment ($${monthlyPaymentAmount}). Deposit counted in monthly column.`);
      }
      
      // OVERPAYMENT LOGIC: Calculate how many instalments are covered by total payments
      // For Group 1 (standard): deposit is separate from monthly columns, add it for sequencing
      // For Group 2 (combined): deposit is already in Column M, do NOT add it again
      let coveredMonths = 0;
      let remainingBalance = 0;
      
      const shouldAddDepositForSequencing = hasVerifiedDeposit && !isCombinedDepositInstallment;
      const effectiveTotalForSequencing = totalPaymentsSum + (shouldAddDepositForSequencing ? depositAmount : 0);
      
      if (monthlyPaymentAmount > 0) {
        coveredMonths = Math.floor(effectiveTotalForSequencing / monthlyPaymentAmount);
        remainingBalance = effectiveTotalForSequencing % monthlyPaymentAmount;
      }
      
      console.log(`Stand ${standNumber}: Effective total for sequencing = ${effectiveTotalForSequencing}, Covered months = ${coveredMonths}, Remaining balance toward next = ${remainingBalance}, combinedDeposit = ${isCombinedDepositInstallment}`);
      
      // Calculate next payment based on covered months (not last filled cell)
      // CRITICAL: Respect Payment Start Date (Column L) - no payment due before this date
      let nextPaymentDue = '';
      let nextPaymentAmount = monthlyPayment; // Default to full monthly payment
      let daysOverdue = 0;
      let isOverdue = false;
      let paymentNotYetDue = false;
      
      const totalPaymentPeriods = paymentColumns.length;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day
      
      // Normalize customer start date for comparison
      const customerStartDateNormalized = new Date(customerStartDate);
      customerStartDateNormalized.setHours(0, 0, 0, 0);
      
      console.log(`Stand ${standNumber}: Today = ${today.toISOString()}, Customer Start Date = ${customerStartDateNormalized.toISOString()}`);
      
      // BUSINESS RULE: If today is before the customer's payment start date,
      // no payment is due yet and nothing can be overdue
      if (today < customerStartDateNormalized) {
        // Payment obligations haven't started yet
        paymentNotYetDue = true;
        nextPaymentDue = customerStartDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        nextPaymentAmount = monthlyPayment;
        isOverdue = false;
        daysOverdue = 0;
        console.log(`Stand ${standNumber}: Payment not yet due - start date is in the future`);
      } else if (coveredMonths >= totalPaymentPeriods) {
        // All instalments are fully covered - no next payment due
        nextPaymentDue = '';
        nextPaymentAmount = '$0.00';
        isOverdue = false;
        daysOverdue = 0;
        console.log(`Stand ${standNumber}: All ${totalPaymentPeriods} instalments fully covered, no payment due`);
      } else {
        // Payment obligations have started - calculate based on customer's start date
        // The first due month for this customer is their start date month
        const nextUncoveredMonth = coveredMonths;
        
        // Calculate next due date from customer's actual start date (not the sheet header)
        const nextDueDate = new Date(customerStartDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + nextUncoveredMonth);
        nextDueDate.setDate(5);
        nextPaymentDue = nextDueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // Calculate remaining amount due for this instalment (if partial payment exists)
        if (remainingBalance > 0) {
          const amountStillDue = monthlyPaymentAmount - remainingBalance;
          nextPaymentAmount = `$${amountStillDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          console.log(`Stand ${standNumber}: Partial payment applied, remaining due = ${nextPaymentAmount}`);
        }
        
        // Check if overdue - only if the next due date has passed
        const dueDateNormalized = new Date(nextDueDate);
        dueDateNormalized.setHours(0, 0, 0, 0);
        
        if (today > dueDateNormalized) {
          isOverdue = true;
          daysOverdue = Math.floor((today.getTime() - dueDateNormalized.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`Stand ${standNumber}: Overdue by ${daysOverdue} days (due: ${nextPaymentDue})`);
        } else {
          console.log(`Stand ${standNumber}: Next payment due ${nextPaymentDue}, not overdue`);
        }
      }
      
      // Progress: derive from amounts (sheet "Payment Progress" can be wrong if formulas/columns shifted)
      const progressPercentage =
        tpNum > 0 ? Math.min(100, Math.round((totalPaidLikeSheet / tpNum) * 100)) : 0;

      console.log(
        `Stand ${standNumber}: Progress = ${progressPercentage}% (sheet had "${paymentProgress}", computed from totals)`,
      );

      // Get agreement signature status from columns BG and BH
      // Checkbox columns typically have "TRUE" or empty/"FALSE"
      const agreementSignedByWarwickshire = customerRow[agreementSignedByWarwickshireCol]?.toString().toUpperCase() === 'TRUE';
      const agreementSignedByClient = customerRow[agreementSignedByClientCol]?.toString().toUpperCase() === 'TRUE';
      
      // Get Agreement of Sale File from column BJ (secure - only for this customer's row)
      const agreementOfSaleFile = customerRow[agreementOfSaleFileCol]?.toString().trim() || null;
      
      console.log(`Stand ${standNumber}: Agreement signed by Warwickshire = ${agreementSignedByWarwickshire}, by Client = ${agreementSignedByClient}`);
      console.log(`Stand ${standNumber}: Agreement of Sale File = ${agreementOfSaleFile ? 'Present' : 'Not available'}`);

      const standData = {
        customerId: customerRow[standNumIndex] || '',
        standNumber: standNumber || '',
        customerName: fullName || '',
        customerCategory: customerCategory,
        customerPhone: phoneNumber,
        standBalance: calculatedCurrentBalance,
        lastPayment: lastPaymentAmount,
        lastPaymentDate: lastPaymentDate,
        nextPayment: nextPaymentAmount,
        nextPaymentDate: nextPaymentDue,
        isOverdue: isOverdue,
        daysOverdue: daysOverdue,
        paymentNotYetDue: paymentNotYetDue,
        paymentStartDate: customerStartDate.toISOString(),
        currentBalance: calculatedCurrentBalance,
        lastDueDate: startDateIndex !== -1 ? (customerRow[startDateIndex] || '') : '',
        monthlyPayment: monthlyPayment,
        nextDueDate: nextPaymentDue,
        totalPaid: calculatedTotalPaid, // Use calculated sum, not sheet formula (which may be stale/incorrect)
        progressPercentage: progressPercentage,
        paymentHistory: paymentHistory,
        agreementSignedByWarwickshire: agreementSignedByWarwickshire,
        agreementSignedByClient: agreementSignedByClient,
        agreementOfSaleFile: agreementOfSaleFile,
        totalPrice: totalPrice, // Total Price from Collection Schedule
        deposit: deposit, // Deposit amount from Collection Schedule
        isVatInclusive: isVatInclusive, // VAT indicator: true=inclusive, false=exclusive, null=unknown
      };
      stands.push(standData);
    }

    return new Response(
      JSON.stringify({ stands }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
