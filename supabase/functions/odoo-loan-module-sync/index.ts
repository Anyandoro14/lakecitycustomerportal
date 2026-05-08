import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { callOdooLoanApi } from "../_shared/odoo-loan-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const auth = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!auth || auth !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").toString();
    const tenantId = (body.tenant_id || "").toString();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert_contract") {
      const contractId = (body.contract_id || "").toString();
      if (!contractId) {
        return new Response(JSON.stringify({ error: "contract_id is required for upsert_contract" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contract, error } = await supabase
        .from("contracts")
        .select(`
          id, stand_number, total_price, monthly_installment, payment_start_date, term_months,
          deposit_amount, is_vat_inclusive, agreement_signed_seller, agreement_signed_buyer, agreement_file_url, status,
          profiles:profiles!contracts_customer_id_fkey(full_name,email,phone_number)
        `)
        .eq("id", contractId)
        .eq("tenant_id", tenantId)
        .single();
      if (error || !contract) throw new Error(error?.message || "Contract not found");

      const profile = (Array.isArray(contract.profiles) ? contract.profiles[0] : contract.profiles) || {};
      const payload = {
        external_uid: contract.id,
        stand_number: contract.stand_number,
        partner: {
          name: profile.full_name || `Stand ${contract.stand_number}`,
          email: profile.email || null,
          phone: profile.phone_number || null,
        },
        term_months: contract.term_months || 36,
        due_day: 5,
        payment_start_date: contract.payment_start_date,
        total_price: Number(contract.total_price || 0),
        deposit_amount: Number(contract.deposit_amount || 0),
        is_vat_inclusive: contract.is_vat_inclusive !== false,
        tax_rate: 0,
        agreement_signed_seller: contract.agreement_signed_seller === true,
        agreement_signed_buyer: contract.agreement_signed_buyer === true,
        agreement_file_url: contract.agreement_file_url || null,
        state: contract.status === "active" ? "active" : "draft",
        generate_schedule: true,
        activate: contract.status === "active",
      };

      const response = await callOdooLoanApi(tenantId, "/lakecity/api/v1/loan/upsert", "POST", payload);
      return new Response(JSON.stringify({ ok: true, action, response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "post_payment") {
      const receiptId = (body.receipt_id || "").toString();
      if (!receiptId) {
        return new Response(JSON.stringify({ error: "receipt_id is required for post_payment" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: receipt, error: rErr } = await supabase
        .from("payment_receipts")
        .select("id, stand_number, amount, payment_date, gateway, gateway_reference, qc_status")
        .eq("id", receiptId)
        .eq("tenant_id", tenantId)
        .single();
      if (rErr || !receipt) throw new Error(rErr?.message || "Receipt not found");
      if (receipt.qc_status !== "approved") {
        return new Response(JSON.stringify({ ok: false, error: "Only approved receipts can be posted" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contract } = await supabase
        .from("contracts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("stand_number", receipt.stand_number)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!contract?.id) {
        return new Response(JSON.stringify({ ok: false, error: `No active contract found for stand ${receipt.stand_number}` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentPayload = {
        external_uid: receipt.id,
        contract_external_uid: contract.id,
        payment_date: receipt.payment_date,
        amount: Number(receipt.amount || 0),
        source: receipt.gateway || "manual",
        reference: receipt.gateway_reference || `Portal-${receipt.id}`,
        state: "posted",
      };

      const response = await callOdooLoanApi(tenantId, "/lakecity/api/v1/payment/post", "POST", paymentPayload);
      await supabase
        .from("payment_receipts")
        .update({ odoo_sync_status: "synced" })
        .eq("id", receipt.id);

      return new Response(JSON.stringify({ ok: true, action, response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch_contract") {
      const externalUid = (body.external_uid || "").toString();
      if (!externalUid) {
        return new Response(JSON.stringify({ error: "external_uid is required for fetch_contract" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const response = await callOdooLoanApi(
        tenantId,
        `/lakecity/api/v1/loan/get?external_uid=${encodeURIComponent(externalUid)}`,
        "GET",
      );
      return new Response(JSON.stringify({ ok: true, action, response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_contract_status") {
      const externalUid = (body.external_uid || "").toString();
      const status = (body.status || "").toString();
      if (!externalUid || !status) {
        return new Response(JSON.stringify({ error: "external_uid and status are required for set_contract_status" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const response = await callOdooLoanApi(tenantId, "/lakecity/api/v1/loan/status", "POST", {
        external_uid: externalUid,
        status,
      });
      return new Response(JSON.stringify({ ok: true, action, response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      error: "Unsupported action",
      supported_actions: ["upsert_contract", "post_payment", "fetch_contract", "set_contract_status"],
    }), {
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
