import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { contract_id } = await req.json();

    if (!contract_id) {
      return new Response(
        JSON.stringify({ error: 'Missing contract_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, tenant_id, term_months, monthly_installment, payment_start_date')
      .eq('id', contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(
        JSON.stringify({ error: 'Contract not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (parseFloat(contract.monthly_installment) <= 0) {
      return new Response(
        JSON.stringify({ error: 'Contract has no monthly_installment set, skipping installment generation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if installments already exist for this contract
    const { count } = await supabase
      .from('installments')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', contract_id);

    if (count && count > 0) {
      console.log(`Installments already exist for contract ${contract_id} (${count} found), skipping`);
      return new Response(
        JSON.stringify({ status: 'ok', message: 'Installments already exist', count }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate installment schedule
    const termMonths = contract.term_months || 36;
    const installments = [];

    for (let i = 0; i < termMonths; i++) {
      const dueDate = new Date(contract.payment_start_date);
      dueDate.setMonth(dueDate.getMonth() + i);

      installments.push({
        tenant_id: contract.tenant_id,
        contract_id: contract.id,
        installment_no: i + 1,
        due_date: dueDate.toISOString().split('T')[0],
        amount: contract.monthly_installment,
        status: 'pending',
      });
    }

    // Batch insert (split into chunks of 500 for safety)
    let totalInserted = 0;
    const batchSize = 500;

    for (let i = 0; i < installments.length; i += batchSize) {
      const batch = installments.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('installments')
        .insert(batch);

      if (insertError) {
        console.error(`Batch insert error (offset ${i}):`, insertError.message);
        return new Response(
          JSON.stringify({ error: `Failed to insert installments at offset ${i}: ${insertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      totalInserted += batch.length;
    }

    console.log(`Generated ${totalInserted} installments for contract ${contract_id} (${termMonths} months)`);

    return new Response(
      JSON.stringify({ status: 'ok', installments_created: totalInserted, term_months: termMonths }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('generate-installments error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
