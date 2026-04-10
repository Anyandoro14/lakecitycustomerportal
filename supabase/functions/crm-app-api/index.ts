import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const tenantId = user.app_metadata?.tenant_id as string | undefined;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Missing tenant context" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: featureEnabled } = await admin.rpc("is_feature_enabled", {
      p_tenant_id: tenantId,
      p_flag_key: "v2_crm_app_enabled",
      p_environment: "prod",
    });
    if (!featureEnabled) {
      return new Response(JSON.stringify({ error: "CRM v2 app is not enabled for this tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = (body.action || "").toString();

    if (action === "list-accounts") {
      const { data, error } = await admin
        .from("crm_accounts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ accounts: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert-account") {
      const payload = body.payload || {};
      const { data, error } = await admin
        .from("crm_accounts")
        .upsert({
          tenant_id: tenantId,
          account_number: payload.account_number,
          name: payload.name,
          type: payload.type || "customer",
          lifecycle_stage: payload.lifecycle_stage || "active",
          metadata: payload.metadata || {},
        }, { onConflict: "tenant_id,account_number" })
        .select("*")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ account: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert-contact") {
      const payload = body.payload || {};
      const { data, error } = await admin
        .from("crm_contacts")
        .upsert({
          tenant_id: tenantId,
          account_id: payload.account_id || null,
          profile_id: payload.profile_id || null,
          first_name: payload.first_name || null,
          last_name: payload.last_name || null,
          full_name: payload.full_name || null,
          email: payload.email || null,
          phone: payload.phone || null,
          role_title: payload.role_title || null,
          is_primary: payload.is_primary === true,
          marketing_opt_in: payload.marketing_opt_in === true,
          metadata: payload.metadata || {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ contact: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-case") {
      const payload = body.payload || {};
      const caseNumber = `CRM-${Date.now()}`;
      const { data, error } = await admin
        .from("crm_cases")
        .insert({
          tenant_id: tenantId,
          account_id: payload.account_id || null,
          contact_id: payload.contact_id || null,
          legacy_support_case_id: payload.legacy_support_case_id || null,
          case_number: caseNumber,
          category: payload.category || "general",
          subject: payload.subject || "Untitled case",
          description: payload.description || null,
          priority: payload.priority || "normal",
          status: payload.status || "open",
        })
        .select("*")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ case: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-cases") {
      const { data, error } = await admin
        .from("crm_cases")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ cases: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
