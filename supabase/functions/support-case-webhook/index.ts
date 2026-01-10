const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This webhook is now for internal logging only
// WhatsApp conversations are initiated by customers via wa.me links

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

    // Log the support case for internal tracking
    console.log(`[Support Case Webhook] New case created: ${case_number}`);
    console.log(`[Support Case Webhook] Customer: ${first_name} ${last_name} (${email})`);
    console.log(`[Support Case Webhook] Issue: ${issue_type} - ${sub_issue}`);
    console.log(`[Support Case Webhook] WhatsApp: ${whatsapp_number || 'Not provided'}`);
    console.log(`[Support Case Webhook] Description: ${description}`);

    // NOTE: WhatsApp messages are NOT sent automatically
    // Customers initiate WhatsApp conversations via wa.me click-to-chat links
    // This ensures compliance with WhatsApp Business policies

    return new Response(
      JSON.stringify({ 
        success: true, 
        case_number,
        message: "Support case logged. Customer will initiate WhatsApp conversation." 
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
