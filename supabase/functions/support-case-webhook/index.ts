const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/8g2mab671nhv3ic1wpk5wxp9mwwmticd";

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
      stand_number,
      whatsapp_number,
      issue_type,
      sub_issue,
      description,
      preferred_contact_method,
    } = payload;

    // Log the support case for internal tracking
    console.log(`[Support Case Webhook] New case created: ${case_number}`);
    console.log(`[Support Case Webhook] Customer: ${first_name} ${last_name} (${email})`);
    console.log(`[Support Case Webhook] Stand Number: ${stand_number || 'Not provided'}`);
    console.log(`[Support Case Webhook] Issue: ${issue_type} - ${sub_issue}`);
    console.log(`[Support Case Webhook] WhatsApp: ${whatsapp_number || 'Not provided'}`);
    console.log(`[Support Case Webhook] Contact Method: ${preferred_contact_method}`);

    // Forward to Make.com webhook with flat fields
    try {
      // Build combined full_name for easier output
      const fullName = [first_name, last_name].filter(Boolean).join(" ") || "Unknown";
      
      // Build URL with query parameters for Make.com to parse individually
      const params = new URLSearchParams();
      params.append("case_number", case_number || "");
      params.append("first_name", first_name || "");
      params.append("last_name", last_name || "");
      params.append("full_name", fullName);
      params.append("email", email || "");
      params.append("customer_email", email || ""); // Duplicate for clarity
      params.append("stand_number", stand_number || "");
      params.append("whatsapp_number", whatsapp_number || "");
      params.append("issue_type", issue_type || "");
      params.append("sub_issue", sub_issue || "");
      params.append("description", description || "");
      params.append("preferred_contact_method", preferred_contact_method || "");
      params.append("timestamp", new Date().toISOString());

      const makeResponse = await fetch(`${MAKE_WEBHOOK_URL}?${params.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
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
