import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse Twilio webhook payload (form-urlencoded)
    const formData = await req.formData();
    
    const messageSid = formData.get("MessageSid") as string;
    const from = formData.get("From") as string; // e.g., "whatsapp:+1234567890" or "+1234567890"
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const numMedia = parseInt(formData.get("NumMedia") as string || "0");
    
    console.log(`[Incoming Message] MessageSid: ${messageSid}`);
    console.log(`[Incoming Message] From: ${from}`);
    console.log(`[Incoming Message] To: ${to}`);
    console.log(`[Incoming Message] Body: ${body?.substring(0, 100)}...`);

    if (!from || !body) {
      console.error("[Incoming Message] Missing required fields");
      return new Response("Missing required fields", { status: 400 });
    }

    // Determine channel and normalize phone number
    const isWhatsApp = from.startsWith("whatsapp:");
    const channel = isWhatsApp ? "whatsapp" : "sms";
    const normalizedPhone = from.replace("whatsapp:", "").trim();

    console.log(`[Incoming Message] Channel: ${channel}, Phone: ${normalizedPhone}`);

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up stand number from contact_stand_mappings
    const { data: mapping } = await supabase
      .from("contact_stand_mappings")
      .select("stand_number")
      .eq("contact_identifier", normalizedPhone)
      .eq("contact_type", "phone")
      .maybeSingle();

    const standNumber = mapping?.stand_number || null;
    console.log(`[Incoming Message] Resolved stand number: ${standNumber || "Unknown"}`);

    // Find existing conversation by phone or create new one
    let conversationId: string;
    
    const { data: existingConvo } = await supabase
      .from("conversations")
      .select("id")
      .eq("primary_phone", normalizedPhone)
      .maybeSingle();

    if (existingConvo) {
      conversationId = existingConvo.id;
      console.log(`[Incoming Message] Found existing conversation: ${conversationId}`);
    } else {
      // Create new conversation
      const { data: newConvo, error: convoError } = await supabase
        .from("conversations")
        .insert({
          primary_phone: normalizedPhone,
          stand_number: standNumber,
          customer_name: standNumber ? `Stand ${standNumber}` : "Unknown Customer",
          status: "open",
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select("id")
        .single();

      if (convoError) {
        console.error("[Incoming Message] Error creating conversation:", convoError);
        throw convoError;
      }

      conversationId = newConvo.id;
      console.log(`[Incoming Message] Created new conversation: ${conversationId}`);

      // Also create contact mapping if we have a stand number
      if (standNumber) {
        await supabase.from("contact_stand_mappings").upsert({
          contact_identifier: normalizedPhone,
          contact_type: "phone",
          stand_number: standNumber,
        }, { onConflict: "contact_identifier,contact_type" }).select();
      }
    }

    // Build raw payload for audit
    const rawPayload: Record<string, string> = {};
    formData.forEach((value, key) => {
      rawPayload[key] = String(value);
    });

    // Insert the message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        channel: channel,
        direction: "inbound",
        body: body,
        received_at: new Date().toISOString(),
        delivery_status: "delivered",
        provider_message_id: messageSid,
        raw_payload: rawPayload,
      })
      .select("id")
      .single();

    if (msgError) {
      console.error("[Incoming Message] Error inserting message:", msgError);
      throw msgError;
    }

    console.log(`[Incoming Message] Message stored: ${message.id}`);

    // Update conversation (trigger should handle this, but explicit update for safety)
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Return TwiML empty response (acknowledges receipt)
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
        status: 200, // Return 200 to prevent Twilio retries
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/xml" 
        } 
      }
    );
  }
});
