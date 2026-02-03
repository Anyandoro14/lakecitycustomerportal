import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/81x3jyzbo1jlry0jq6fqgzekctlsqim9";

// Google OAuth token generation
async function getGoogleAccessToken(): Promise<string> {
  const keyString = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || '';
  
  let privateKeyPem: string;
  let serviceAccountEmail: string;
  
  try {
    const credentials = JSON.parse(keyString.replace(/\\n/g, '\n'));
    privateKeyPem = credentials.private_key;
    serviceAccountEmail = credentials.client_email;
  } catch (e) {
    privateKeyPem = keyString;
    serviceAccountEmail = clientEmail;
  }

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!serviceAccountEmail || !emailRegex.test(serviceAccountEmail)) {
    throw new Error('Invalid or missing service account email');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const base64url = (str: string) => {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };
  
  const jwtHeader = base64url(JSON.stringify(header));
  const jwtClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSet}`;
  
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
    const errorData = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorData}`);
  }

  const { access_token } = await tokenResponse.json();
  return access_token;
}

// Check if phone number belongs to an internal user (admin/approver)
async function isInternalUserPhone(phoneNumber: string): Promise<{ isInternal: boolean; email?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('[QC Detection] Missing Supabase credentials');
    return { isInternal: false };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Normalize phone number for comparison (remove spaces, ensure + prefix)
  const normalizedPhone = phoneNumber.replace(/\s/g, '');
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.replace(/^\+/, ''),
    `+${normalizedPhone.replace(/^\+/, '')}`,
  ];

  // Query profiles table for matching phone, then check if user is internal
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, phone_number')
    .or(phoneVariants.map(p => `phone_number.eq.${p}`).join(','));

  if (profileError) {
    console.error('[QC Detection] Profile query error:', profileError);
    return { isInternal: false };
  }

  if (!profiles || profiles.length === 0) {
    console.log(`[QC Detection] No profile found for phone: ${normalizedPhone}`);
    return { isInternal: false };
  }

  // Check if any matched profile is an internal user
  for (const profile of profiles) {
    const { data: internalUser, error: internalError } = await supabase
      .from('internal_users')
      .select('email, role')
      .eq('user_id', profile.id)
      .single();

    if (!internalError && internalUser) {
      console.log(`[QC Detection] Found internal user: ${internalUser.email} (${internalUser.role})`);
      return { isInternal: true, email: internalUser.email };
    }
  }

  console.log(`[QC Detection] Phone ${normalizedPhone} is not an internal user`);
  return { isInternal: false };
}

// Find pending receipt in Receipts_Intake and update its status
async function updateReceiptStatus(
  accessToken: string,
  standNumber: string,
  newStatus: 'Approved' | 'Declined',
  approverEmail: string
): Promise<{ success: boolean; message: string; receiptId?: string }> {
  const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
  if (!spreadsheetId) {
    return { success: false, message: 'SPREADSHEET_ID not configured' };
  }

  // Find Receipts_Intake sheet
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metadataResponse.ok) {
    return { success: false, message: 'Failed to fetch spreadsheet metadata' };
  }

  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  const receiptsSheet = sheets.find((s: any) => s.properties.title === 'Receipts_Intake');

  if (!receiptsSheet) {
    return { success: false, message: 'Receipts_Intake sheet not found' };
  }

  const sheetTitle = receiptsSheet.properties.title;

  // Fetch all receipts to find the one with PENDING_QC status for this stand
  const range = encodeURIComponent(`${sheetTitle}!A:L`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { success: false, message: 'Failed to fetch Receipts_Intake data' };
  }

  const data = await response.json();
  const rows = data.values || [];

  if (rows.length < 2) {
    return { success: false, message: 'No receipts found' };
  }

  // Column indices (0-based)
  const COL_INTAKE_ID = 0;
  const COL_STAND_NUMBER = 2;
  const COL_INTAKE_STATUS = 10;

  // Find the most recent PENDING_QC receipt for this stand
  let targetRow = -1;
  let targetIntakeId = '';
  
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const rowStand = row[COL_STAND_NUMBER]?.toString().trim() || '';
    const rowStatus = row[COL_INTAKE_STATUS]?.toString().trim() || '';
    
    if (rowStand === standNumber && rowStatus === 'PENDING_QC') {
      targetRow = i + 1; // 1-indexed for Sheets API
      targetIntakeId = row[COL_INTAKE_ID]?.toString() || `ROW_${targetRow}`;
      break;
    }
  }

  if (targetRow === -1) {
    return { 
      success: false, 
      message: `No pending receipt found for stand ${standNumber}. It may have already been processed.` 
    };
  }

  // Update Column K (index 10, letter K) with the new status
  const updateRange = `${sheetTitle}!K${targetRow}`;
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=RAW`;

  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [[newStatus]],
    }),
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error(`[QC Update] Failed to update sheet: ${errorText}`);
    return { success: false, message: 'Failed to update receipt status in sheet' };
  }

  console.log(`[QC Update] Successfully updated receipt ${targetIntakeId} for stand ${standNumber} to ${newStatus} by ${approverEmail}`);
  
  return { 
    success: true, 
    message: `Receipt ${targetIntakeId} for stand ${standNumber} has been ${newStatus.toLowerCase()}.`,
    receiptId: targetIntakeId
  };
}

// Send confirmation WhatsApp message back to approver
async function sendConfirmationMessage(toPhone: string, message: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    console.error('[QC Confirmation] Missing Twilio credentials');
    return;
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  try {
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:${toPhone}`,
        From: `whatsapp:${fromNumber}`,
        Body: message,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[QC Confirmation] Failed to send:', error);
    } else {
      console.log('[QC Confirmation] Sent confirmation message');
    }
  } catch (error) {
    console.error('[QC Confirmation] Error:', error);
  }
}

// Extract stand number from the original message context
function extractStandNumberFromContext(body: string): string | null {
  // The approval message format includes "STAND NUMBER:XXXX"
  // When user replies, we need to extract from context or the reply
  const standMatch = body.match(/STAND\s*NUMBER[:\s]*(\d+)/i);
  if (standMatch) {
    return standMatch[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse Twilio webhook payload (form-urlencoded)
    const formData = await req.formData();
    
    const messageSid = formData.get("MessageSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const numMedia = formData.get("NumMedia") as string;
    const accountSid = formData.get("AccountSid") as string;
    
    // Get the original message that was replied to (for context)
    const originalMessageSid = formData.get("OriginalRepliedMessageSid") as string;
    const originalMessageBody = formData.get("OriginalRepliedMessageBody") as string;
    
    console.log(`[Incoming Message] MessageSid: ${messageSid}`);
    console.log(`[Incoming Message] From: ${from}`);
    console.log(`[Incoming Message] To: ${to}`);
    console.log(`[Incoming Message] Body: ${body?.substring(0, 100)}...`);
    console.log(`[Incoming Message] Original Reply Context: ${originalMessageBody?.substring(0, 100) || 'N/A'}`);

    // Determine channel and normalize phone number
    const isWhatsApp = from?.startsWith("whatsapp:") || false;
    const channel = isWhatsApp ? "whatsapp" : "sms";
    const normalizedPhone = from?.replace("whatsapp:", "").trim() || "";

    console.log(`[Incoming Message] Channel: ${channel}, Phone: ${normalizedPhone}`);

    // Check if this is a QC approval/decline response
    const bodyLower = body?.trim().toLowerCase() || '';
    const isApprovalResponse = bodyLower === 'approved' || bodyLower === 'approve';
    const isDeclineResponse = bodyLower === 'declined' || bodyLower === 'decline';
    
    if (isApprovalResponse || isDeclineResponse) {
      console.log(`[QC Detection] Potential QC response detected: "${body}"`);
      
      // Check if sender is an internal user
      const { isInternal, email } = await isInternalUserPhone(normalizedPhone);
      
      if (isInternal && email) {
        console.log(`[QC Detection] Confirmed internal user: ${email}`);
        
        // Try to extract stand number from the original message context
        let standNumber = extractStandNumberFromContext(originalMessageBody || '');
        
        // If not found in context, try the current body (in case it was included)
        if (!standNumber) {
          standNumber = extractStandNumberFromContext(body || '');
        }
        
        if (standNumber) {
          console.log(`[QC Detection] Processing QC for stand: ${standNumber}`);
          
          try {
            const accessToken = await getGoogleAccessToken();
            const newStatus = isApprovalResponse ? 'Approved' : 'Declined';
            const result = await updateReceiptStatus(accessToken, standNumber, newStatus, email);
            
            // Send confirmation back to approver
            const confirmationMessage = result.success 
              ? `✅ ${result.message}`
              : `❌ ${result.message}`;
            
            await sendConfirmationMessage(normalizedPhone, confirmationMessage);
            
            console.log(`[QC Detection] Processed: ${result.message}`);
          } catch (error) {
            console.error('[QC Detection] Error processing approval:', error);
            await sendConfirmationMessage(
              normalizedPhone, 
              `❌ Error processing your ${isApprovalResponse ? 'approval' : 'decline'}. Please try again or contact support.`
            );
          }
          
          // Return TwiML response - don't forward to Make.com chatbot
          return new Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/xml" } 
            }
          );
        } else {
          console.log(`[QC Detection] Could not extract stand number from context`);
          await sendConfirmationMessage(
            normalizedPhone,
            `⚠️ Could not identify which receipt you're responding to. Please reply directly to the original receipt review message.`
          );
          
          return new Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/xml" } 
            }
          );
        }
      } else {
        console.log(`[QC Detection] Sender is not an internal user, forwarding to chatbot`);
      }
    }

    // Not a QC response - forward to Make.com webhook (existing behavior)
    const params = new URLSearchParams();
    params.append("message_sid", messageSid || "");
    params.append("from", from || "");
    params.append("from_phone", normalizedPhone);
    params.append("to", to || "");
    params.append("body", body || "");
    params.append("channel", channel);
    params.append("num_media", numMedia || "0");
    params.append("account_sid", accountSid || "");
    params.append("timestamp", new Date().toISOString());

    const makeResponse = await fetch(`${MAKE_WEBHOOK_URL}?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!makeResponse.ok) {
      console.error(`[Incoming Message] Make.com webhook failed: ${makeResponse.status}`);
    } else {
      console.log(`[Incoming Message] Successfully forwarded to Make.com`);
    }

    // Return TwiML empty response (acknowledges receipt to Twilio)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/xml" 
        } 
      }
    );
  } catch (error) {
    console.error("[Incoming Message] Error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        status: 200,
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/xml" 
        } 
      }
    );
  }
});
