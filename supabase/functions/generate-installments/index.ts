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
    const auth = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!auth || auth !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const contractId = body.contract_id as string | undefined;
    const force = body.force === true;

    if (!contractId) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, tenant_id, payment_start_date, monthly_installment, term_months")
      .eq("id", contractId)
      .single();

    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count, error: countErr } = await supabase
      .from("installments")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contractId);

    if (countErr) {
      return new Response(JSON.stringify({ error: countErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((count ?? 0) > 0 && !force) {
      return new Response(JSON.stringify({ ok: true, skipped: true, message: "Installments already exist" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (force && (count ?? 0) > 0) {
      const { error: delErr } = await supabase.from("installments").delete().eq("contract_id", contractId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const termMonths = Math.max(1, Number(contract.term_months) || 36);
    const amount = Number(contract.monthly_installment);
    const start = new Date(contract.payment_start_date);
    if (isNaN(start.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid payment_start_date" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows: Array<{
      tenant_id: string;
      contract_id: string;
      installment_no: number;
      due_date: string;
      amount: number;
      status: string;
    }> = [];

    for (let i = 0; i < termMonths; i++) {
      const due = new Date(start);
      due.setMonth(due.getMonth() + i);
      rows.push({
        tenant_id: contract.tenant_id,
        contract_id: contract.id,
        installment_no: i + 1,
        due_date: due.toISOString().split("T")[0],
        amount,
        status: "pending",
      });
    }

    const { error: insErr } = await supabase.from("installments").insert(rows);
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, created: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
