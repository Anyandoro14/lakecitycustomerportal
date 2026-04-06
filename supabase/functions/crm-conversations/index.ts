import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConversationFilters {
  status?: string;
  channel?: string;
  assignedToMe?: boolean;
  unreadOnly?: boolean;
  category?: string;
  search?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user info
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email?.toLowerCase() || "";
    const tenantId = userData.user.app_metadata?.tenant_id;

    // Verify internal user
    if (!userEmail.endsWith("@lakecity.co.zw")) {
      return new Response(
        JSON.stringify({ error: "Access restricted to LakeCity staff" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case "list": {
        const { filters, currentUserId } = params as { filters: ConversationFilters; currentUserId?: string };

        let query = supabaseAdmin
          .from("conversations")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(100);

        if (tenantId) query = query.eq("tenant_id", tenantId);

        if (filters?.status) {
          query = query.eq("status", filters.status);
        }
        if (filters?.assignedToMe && currentUserId) {
          query = query.eq("assigned_to_user_id", currentUserId);
        }
        if (filters?.unreadOnly) {
          query = query.gt("unread_count", 0);
        }
        if (filters?.category) {
          query = query.eq("customer_category", filters.category);
        }
        if (filters?.search) {
          const searchTerm = `%${filters.search}%`;
          query = query.or(`stand_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},primary_phone.ilike.${searchTerm},primary_email.ilike.${searchTerm}`);
        }

        const { data: conversations, error } = await query;

        if (error) throw error;

        // Get last message preview for each conversation
        const conversationsWithPreview = await Promise.all(
          (conversations || []).map(async (conv) => {
            const { data: lastMsg } = await supabaseAdmin
              .from("messages")
              .select("body, channel")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            return {
              ...conv,
              last_message_preview: lastMsg?.body?.substring(0, 80) || null,
              last_message_channel: lastMsg?.channel || null,
            };
          })
        );

        return new Response(
          JSON.stringify({ conversations: conversationsWithPreview }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-messages": {
        const { conversationId } = params;

        const [messagesResult, notesResult] = await Promise.all([
          supabaseAdmin
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true }),
          supabaseAdmin
            .from("internal_notes")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true }),
        ]);

        if (messagesResult.error) throw messagesResult.error;
        if (notesResult.error) throw notesResult.error;

        return new Response(
          JSON.stringify({
            messages: messagesResult.data || [],
            notes: notesResult.data || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "send-message": {
        const { conversationId, channel, body } = params;

        // Get conversation details
        const { data: conversation, error: convError } = await supabaseAdmin
          .from("conversations")
          .select("*")
          .eq("id", conversationId)
          .single();

        if (convError || !conversation) {
          throw new Error("Conversation not found");
        }

        const recipient = channel === "email" ? conversation.primary_email : conversation.primary_phone;

        if (!recipient) {
          throw new Error(`No ${channel === "email" ? "email" : "phone"} available for this contact`);
        }

        // Format phone number for Twilio
        let formattedPhone = recipient;
        if (channel !== "email") {
          formattedPhone = recipient.replace(/\s+/g, "");
          if (formattedPhone.startsWith("0")) {
            formattedPhone = "+263" + formattedPhone.substring(1);
          } else if (!formattedPhone.startsWith("+")) {
            formattedPhone = "+" + formattedPhone;
          }
        }

        let providerMessageId: string | null = null;
        let deliveryStatus: string = "queued";

        if (channel === "email") {
          // Send via Resend
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (!resendApiKey) {
            throw new Error("Email service not configured");
          }

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "LakeCity <noreply@lakecity.co.zw>",
              to: [recipient],
              subject: "Message from LakeCity",
              text: body,
            }),
          });

          const emailResult = await emailResponse.json();
          if (!emailResponse.ok) {
            throw new Error(emailResult.message || "Failed to send email");
          }
          providerMessageId = emailResult.id;
          deliveryStatus = "sent";
        } else {
          // Send via Twilio
          const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
          const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
          const twilioPhone = channel === "whatsapp"
            ? Deno.env.get("TWILIO_WHATSAPP_NUMBER")
            : Deno.env.get("TWILIO_PHONE_NUMBER");

          if (!accountSid || !authToken || !twilioPhone) {
            throw new Error(`${channel === "whatsapp" ? "WhatsApp" : "SMS"} service not configured`);
          }

          const from = channel === "whatsapp" ? `whatsapp:${twilioPhone}` : twilioPhone;
          const to = channel === "whatsapp" ? `whatsapp:${formattedPhone}` : formattedPhone;

          const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ From: from, To: to, Body: body }),
            }
          );

          const twilioResult = await twilioResponse.json();
          if (!twilioResponse.ok) {
            throw new Error(twilioResult.message || "Failed to send message");
          }
          providerMessageId = twilioResult.sid;
          deliveryStatus = "sent";
        }

        // Insert message record
        const { data: message, error: msgError } = await supabaseAdmin
          .from("messages")
          .insert({
            conversation_id: conversationId,
            channel,
            direction: "outbound",
            body,
            sent_at: new Date().toISOString(),
            provider_message_id: providerMessageId,
            delivery_status: deliveryStatus,
            created_by_user_id: userId,
            ...(tenantId ? { tenant_id: tenantId } : {}),
          })
          .select()
          .single();

        if (msgError) throw msgError;

        // Log to audit
        await supabaseAdmin.from("audit_log").insert({ ...(tenantId ? { tenant_id: tenantId } : {}),
          action: `SEND_${channel.toUpperCase()}`,
          entity_type: "conversation",
          entity_id: conversationId,
          performed_by: userId,
          performed_by_email: userEmail,
          details: {
            stand_number: conversation.stand_number,
            recipient: channel === "email" ? recipient : formattedPhone,
            message_preview: body.substring(0, 50),
          },
        });

        return new Response(
          JSON.stringify({ success: true, message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add-note": {
        const { conversationId, note } = params;

        const { data, error } = await supabaseAdmin
          .from("internal_notes")
          .insert({
            conversation_id: conversationId,
            note,
            created_by: userId,
            created_by_email: userEmail,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, note: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update-status": {
        const { conversationId, status } = params;

        const { error } = await supabaseAdmin
          .from("conversations")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "assign": {
        const { conversationId, assignToUserId } = params;

        // Get current assignment for audit
        const { data: currentConv } = await supabaseAdmin
          .from("conversations")
          .select("assigned_to_user_id")
          .eq("id", conversationId)
          .single();

        const { error } = await supabaseAdmin
          .from("conversations")
          .update({
            assigned_to_user_id: assignToUserId || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (error) throw error;

        // Log assignment change
        if (assignToUserId) {
          const { data: assignee } = await supabaseAdmin
            .from("internal_users")
            .select("email")
            .eq("user_id", assignToUserId)
            .single();

          await supabaseAdmin.from("conversation_assignments_audit").insert({
            conversation_id: conversationId,
            from_user_id: currentConv?.assigned_to_user_id,
            to_user_id: assignToUserId,
            to_user_email: assignee?.email,
            changed_by: userId,
            changed_by_email: userEmail,
          });
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "link-to-stand": {
        const { conversationId, standNumber } = params;

        // Update conversation
        const { error: updateError } = await supabaseAdmin
          .from("conversations")
          .update({
            stand_number: standNumber,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (updateError) throw updateError;

        // Get conversation's contact info
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("primary_phone, primary_email")
          .eq("id", conversationId)
          .single();

        // Create contact mappings for future resolution
        if (conv?.primary_phone) {
          await supabaseAdmin.from("contact_stand_mappings").upsert(
            {
              contact_identifier: conv.primary_phone,
              contact_type: "phone",
              stand_number: standNumber,
              created_by: userId,
              created_by_email: userEmail,
            },
            { onConflict: "contact_identifier,contact_type" }
          );
        }

        if (conv?.primary_email) {
          await supabaseAdmin.from("contact_stand_mappings").upsert(
            {
              contact_identifier: conv.primary_email,
              contact_type: "email",
              stand_number: standNumber,
              created_by: userId,
              created_by_email: userEmail,
            },
            { onConflict: "contact_identifier,contact_type" }
          );
        }

        // Audit log
        await supabaseAdmin.from("audit_log").insert({ ...(tenantId ? { tenant_id: tenantId } : {}),
          action: "LINK_CONTACT_TO_STAND",
          entity_type: "conversation",
          entity_id: conversationId,
          performed_by: userId,
          performed_by_email: userEmail,
          details: {
            stand_number: standNumber,
            phone: conv?.primary_phone,
            email: conv?.primary_email,
          },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "mark-read": {
        const { conversationId } = params;

        const { error } = await supabaseAdmin
          .from("conversations")
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create-or-find": {
        // Used by inbound webhooks to find or create a conversation
        const { phone, email, standNumber, customerName, category } = params;

        // Try to find existing conversation
        let query = supabaseAdmin.from("conversations").select("*");

        if (standNumber) {
          query = query.eq("stand_number", standNumber);
        } else if (phone) {
          query = query.eq("primary_phone", phone);
        } else if (email) {
          query = query.eq("primary_email", email);
        }

        const { data: existing } = await query.limit(1).single();

        if (existing) {
          return new Response(
            JSON.stringify({ conversation: existing, created: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Try to match contact to stand via mappings
        let resolvedStand = standNumber;
        if (!resolvedStand && phone) {
          const { data: mapping } = await supabaseAdmin
            .from("contact_stand_mappings")
            .select("stand_number")
            .eq("contact_identifier", phone)
            .eq("contact_type", "phone")
            .single();
          resolvedStand = mapping?.stand_number;
        }
        if (!resolvedStand && email) {
          const { data: mapping } = await supabaseAdmin
            .from("contact_stand_mappings")
            .select("stand_number")
            .eq("contact_identifier", email)
            .eq("contact_type", "email")
            .single();
          resolvedStand = mapping?.stand_number;
        }

        // Create new conversation
        const { data: newConv, error: createError } = await supabaseAdmin
          .from("conversations")
          .insert({
            stand_number: resolvedStand || null,
            customer_name: customerName || null,
            customer_category: category || null,
            primary_phone: phone || null,
            primary_email: email || null,
            status: "open",
            ...(tenantId ? { tenant_id: tenantId } : {}),
          })
          .select()
          .single();

        if (createError) throw createError;

        return new Response(
          JSON.stringify({ conversation: newConv, created: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("CRM conversations error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
