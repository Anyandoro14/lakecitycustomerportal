const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/rgq377xe7pqsq1a09h1ltkljrp5kxex4";

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
      preferred_contact_method,
    } = payload;

    // Log the support case for internal tracking
    console.log(`[Support Case Webhook] New case created: ${case_number}`);
    console.log(`[Support Case Webhook] Customer: ${first_name} ${last_name} (${email})`);
    console.log(`[Support Case Webhook] Issue: ${issue_type} - ${sub_issue}`);
    console.log(`[Support Case Webhook] WhatsApp: ${whatsapp_number || 'Not provided'}`);
    console.log(`[Support Case Webhook] Contact Method: ${preferred_contact_method}`);
    console.log(`[Support Case Webhook] Description: ${description}`);

    // Forward to Make.com webhook
    try {
      const makeResponse = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          case_number,
          first_name,
          last_name,
          email,
          whatsapp_number,
          issue_type,
          sub_issue,
          description,
          preferred_contact_method,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!makeResponse.ok) {
        console.error(`[Support Case Webhook] Make.com webhook failed: ${makeResponse.status}`);
      } else {
        console.log(`[Support Case Webhook] Successfully forwarded to Make.com`);
      }
    } catch (makeError) {
      console.error(`[Support Case Webhook] Error forwarding to Make.com:`, makeError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        case_number,
        message: "Support case logged and forwarded to Make.com." 
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
