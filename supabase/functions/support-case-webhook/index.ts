const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Make.com webhook URL
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
    } = payload;

    console.log(`[Support Case Webhook] New case: ${case_number}`);
    console.log(`[Support Case Webhook] Customer: ${first_name} ${last_name} (${email})`);
    console.log(`[Support Case Webhook] Issue: ${issue_type} - ${sub_issue}`);
    console.log(`[Support Case Webhook] WhatsApp: ${whatsapp_number || 'Not provided'}`);

    // Send to Make.com webhook
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
        whatsapp_number: whatsapp_number || null,
        issue_type,
        sub_issue,
        description,
        submitted_at: new Date().toISOString(),
        source: "LakeCity Customer Portal",
      }),
    });

    if (!makeResponse.ok) {
      const errorText = await makeResponse.text();
      console.error(`[Support Case Webhook] Make.com error: ${makeResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          webhook_sent: false, 
          reason: "Make.com webhook failed",
          case_number 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Support Case Webhook] Make.com webhook triggered successfully for case ${case_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        webhook_sent: true,
        case_number,
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
