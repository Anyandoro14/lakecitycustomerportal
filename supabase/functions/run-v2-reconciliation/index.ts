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
    const tenantId = (body.tenant_id || "").toString();
    const environment = (body.environment || "staging").toString();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey);
    const toleranceAmount = Number(body.tolerance_amount ?? 0.01);

    const { data: run, error: runError } = await supabase
      .from("reconciliation_runs")
      .insert({
        tenant_id: tenantId,
        environment,
        source: "v2_legacy_balance_variance_view",
        status: "running",
      })
      .select("id")
      .single();
    if (runError || !run?.id) throw new Error(runError?.message || "Failed to create reconciliation run");

    const { data: varianceRows, error: varianceError } = await supabase
      .from("v2_legacy_balance_variance_view")
      .select("*")
      .eq("tenant_id", tenantId);
    if (varianceError) throw varianceError;

    let criticalCount = 0;
    for (const row of varianceRows || []) {
      const variance = Number(row.variance_amount || 0);
      const withinTolerance = Math.abs(variance) <= toleranceAmount;
      if (!withinTolerance) criticalCount += 1;

      await supabase.from("shadow_read_comparisons").insert({
        tenant_id: tenantId,
        contract_id: row.contract_id,
        legacy_current_balance: row.legacy_current_balance,
        v2_current_balance: row.v2_current_balance,
        variance_amount: row.variance_amount,
        variance_percent: row.variance_percent,
        within_tolerance: withinTolerance,
      });

      await supabase.from("reconciliation_items").insert({
        tenant_id: tenantId,
        reconciliation_run_id: run.id,
        object_type: "contract_balance",
        object_id: row.contract_id,
        expected_amount: row.legacy_current_balance,
        actual_amount: row.v2_current_balance,
        variance_amount: row.variance_amount,
        severity: withinTolerance ? "info" : "critical",
        status: withinTolerance ? "resolved" : "open",
        details: { variance_percent: row.variance_percent },
      });
    }

    const runPassed = criticalCount === 0;
    await supabase
      .from("reconciliation_runs")
      .update({
        status: runPassed ? "passed" : "failed",
        summary: {
          total: varianceRows?.length || 0,
          critical: criticalCount,
          tolerance_amount: toleranceAmount,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await supabase
      .from("cutover_acceptance_gates")
      .upsert({
        tenant_id: tenantId,
        environment,
        gate_code: "balance_variance_zero",
        passed: runPassed,
        evaluated_at: new Date().toISOString(),
        evidence: {
          run_id: run.id,
          critical_count: criticalCount,
          total_rows: varianceRows?.length || 0,
          tolerance_amount: toleranceAmount,
        },
      }, { onConflict: "tenant_id,environment,gate_code" });

    return new Response(JSON.stringify({
      ok: true,
      run_id: run.id,
      total_compared: varianceRows?.length || 0,
      critical_count: criticalCount,
      passed: runPassed,
    }), {
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
