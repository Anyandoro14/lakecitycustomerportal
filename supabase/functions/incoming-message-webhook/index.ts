const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/81x3jyzbo1jlry0jq6fqgzekctlsqim9";

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
    
    console.log(`[Incoming Message] MessageSid: ${messageSid}`);
    console.log(`[Incoming Message] From: ${from}`);
    console.log(`[Incoming Message] To: ${to}`);
    console.log(`[Incoming Message] Body: ${body?.substring(0, 100)}...`);

    // Determine channel and normalize phone number
    const isWhatsApp = from?.startsWith("whatsapp:") || false;
    const channel = isWhatsApp ? "whatsapp" : "sms";
    const normalizedPhone = from?.replace("whatsapp:", "").trim() || "";

    console.log(`[Incoming Message] Channel: ${channel}, Phone: ${normalizedPhone}`);

    // Forward to Make.com webhook
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
