import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// WhatsApp notification target number
const SUPPORT_WHATSAPP_NUMBER = "+263783002138";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    const {
      case_number,
      first_name,
      last_name,
      email,
      whatsapp_number,
      issue_type,
      sub_issue,
      description,
    } = payload;

    console.log(`[Support Case Webhook] New case: ${case_number}`);
    console.log(`[Support Case Webhook] Customer: ${first_name} ${last_name} (${email})`);
    console.log(`[Support Case Webhook] Issue: ${issue_type} - ${sub_issue}`);
    console.log(`[Support Case Webhook] WhatsApp: ${whatsapp_number || 'Not provided'}`);

    // Send WhatsApp notification using Twilio
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!accountSid || !authToken) {
      console.error("[Support Case Webhook] Twilio credentials not configured");
      return new Response(
        JSON.stringify({ success: true, whatsapp_sent: false, reason: "Twilio not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format the WhatsApp message
    const message = `🆘 *New Support Case*

📋 *Case Number:* ${case_number}

👤 *Customer:* ${first_name} ${last_name}
📧 *Email:* ${email}
📱 *WhatsApp:* ${whatsapp_number || 'Not provided'}

🔖 *Issue Type:* ${issue_type}
📝 *Specific Issue:* ${sub_issue}

💬 *Description:*
${description}

---
_Submitted via LakeCity Customer Portal_`;

    // Send WhatsApp message via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append("To", `whatsapp:${SUPPORT_WHATSAPP_NUMBER}`);
    formData.append("From", "whatsapp:+14155238886"); // Twilio WhatsApp sandbox number
    formData.append("Body", message);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("[Support Case Webhook] Twilio error:", twilioResult);
      return new Response(
        JSON.stringify({ 
          success: true, 
          whatsapp_sent: false, 
          reason: "WhatsApp delivery failed",
          case_number 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Support Case Webhook] WhatsApp notification sent successfully for case ${case_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        whatsapp_sent: true,
        case_number,
        message_sid: twilioResult.sid 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Support Case Webhook] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
