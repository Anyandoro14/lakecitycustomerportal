import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const parseCurrency = (val: string): number => {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const formatCurrency = (val: number): string => {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user via JWT
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let tenantId: string | null = null;
    let targetStandNumber: string | null = null;
    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
      targetStandNumber = body.target_stand_number || null; // Looking Glass mode
    } catch {
      // No body
    }

    // Get user's profile
    let profileQuery = supabase
      .from('profiles')
      .select('id, stand_number, full_name, email, phone, tenant_id, payment_start_date')
      .eq('user_id', user.id);

    if (tenantId) {
      profileQuery = profileQuery.eq('tenant_id', tenantId);
    }

    const { data: profile, error: profileError } = await profileQuery.maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveTenantId = tenantId || profile.tenant_id;

    // Determine which stand(s) to fetch
    // Looking Glass mode: use targetStandNumber; Normal mode: fetch all contracts for this customer
    let contractsQuery = supabase
      .from('contracts')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('status', 'active');

    if (targetStandNumber) {
      contractsQuery = contractsQuery.eq('stand_number', targetStandNumber);
    } else {
      contractsQuery = contractsQuery.eq('customer_id', profile.id);
    }

    const { data: contracts, error: contractsError } = await contractsQuery;

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch contracts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!contracts || contracts.length === 0) {
      return new Response(
        JSON.stringify({ stands: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch balances, installments, and payment history for all contracts
    const standNumbers = contracts.map(c => c.stand_number);

    const [balancesResult, installmentsResult, receiptsResult] = await Promise.all([
      supabase
        .from('contract_balances')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .in('stand_number', standNumbers),
      supabase
        .from('installments')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .in('contract_id', contracts.map(c => c.id))
        .order('due_date', { ascending: true }),
      supabase
        .from('payment_receipts')
        .select('id, amount, payment_date, gateway, gateway_reference, qc_status, created_at')
        .eq('tenant_id', effectiveTenantId)
        .eq('qc_status', 'approved')
        .in('stand_number', standNumbers)
        .order('payment_date', { ascending: false }),
    ]);

    // Build balance lookup
    const balanceMap: Record<string, any> = {};
    for (const b of balancesResult.data || []) {
      balanceMap[b.stand_number] = b;
    }

    // Build installments lookup by contract_id
    const installmentsByContract: Record<string, any[]> = {};
    for (const inst of installmentsResult.data || []) {
      if (!installmentsByContract[inst.contract_id]) {
        installmentsByContract[inst.contract_id] = [];
      }
      installmentsByContract[inst.contract_id].push(inst);
    }

    // Build receipts lookup by stand_number
    const receiptsByStand: Record<string, any[]> = {};
    for (const r of receiptsResult.data || []) {
      if (!receiptsByStand[r.stand_number]) {
        receiptsByStand[r.stand_number] = [];
      }
      receiptsByStand[r.stand_number].push(r);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build response in same shape as fetch-google-sheets
    const stands = contracts.map(contract => {
      const balance = balanceMap[contract.stand_number];
      const installments = installmentsByContract[contract.id] || [];
      const receipts = receiptsByStand[contract.stand_number] || [];

      // Compute totals from balance view or from receipts directly
      const totalPaid = balance ? parseFloat(balance.total_paid) : 0;
      const currentBalance = balance ? parseFloat(balance.current_balance) : parseFloat(contract.total_price);
      const progressPercentage = balance ? parseFloat(balance.progress_percentage) || 0 : 0;
      const lastPaymentDate = balance?.last_payment_date || '';
      const lastPaymentAmount = balance?.last_payment_amount ? parseFloat(balance.last_payment_amount) : 0;

      // Find next unpaid installment
      const pendingInstallments = installments.filter(i => i.status === 'pending');
      const nextInstallment = pendingInstallments[0]; // Already sorted by due_date asc

      let nextPaymentDate = '';
      let nextPaymentAmount = formatCurrency(parseFloat(contract.monthly_installment));
      let isOverdue = false;
      let daysOverdue = 0;
      let paymentNotYetDue = false;

      const paymentStartDate = new Date(contract.payment_start_date);
      paymentStartDate.setHours(0, 0, 0, 0);

      if (today < paymentStartDate) {
        // Payment period hasn't started yet
        paymentNotYetDue = true;
        nextPaymentDate = paymentStartDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      } else if (!nextInstallment) {
        // All installments paid or none generated
        if (currentBalance <= 0) {
          nextPaymentAmount = '$0.00';
        }
      } else {
        const dueDate = new Date(nextInstallment.due_date);
        dueDate.setHours(0, 0, 0, 0);
        nextPaymentDate = dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        nextPaymentAmount = formatCurrency(parseFloat(nextInstallment.amount));

        if (today > dueDate) {
          isOverdue = true;
          daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      // Build payment history array (same shape as fetch-google-sheets)
      const paymentHistory = receipts.map(r => ({
        date: new Date(r.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        amount: formatCurrency(parseFloat(r.amount)),
        amount_numeric: parseFloat(r.amount),
        installment_period: new Date(r.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
        reference: r.gateway_reference || '',
        payment_method: r.gateway || 'manual',
      }));

      return {
        customerId: contract.stand_number,
        standNumber: contract.stand_number,
        customerName: profile.full_name || '',
        customerCategory: '',
        customerPhone: profile.phone || '',
        standBalance: formatCurrency(currentBalance),
        lastPayment: lastPaymentAmount > 0 ? formatCurrency(lastPaymentAmount) : '',
        lastPaymentDate: lastPaymentDate
          ? new Date(lastPaymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : '',
        nextPayment: nextPaymentAmount,
        nextPaymentDate,
        isOverdue,
        daysOverdue,
        paymentNotYetDue,
        paymentStartDate: contract.payment_start_date,
        currentBalance: formatCurrency(currentBalance),
        lastDueDate: '',
        monthlyPayment: formatCurrency(parseFloat(contract.monthly_installment)),
        nextDueDate: nextPaymentDate,
        totalPaid: formatCurrency(totalPaid),
        progressPercentage: Math.round(progressPercentage),
        paymentHistory,
        agreementSignedByWarwickshire: contract.agreement_signed_seller || false,
        agreementSignedByClient: contract.agreement_signed_buyer || false,
        agreementOfSaleFile: contract.agreement_file_url || null,
        totalPrice: formatCurrency(parseFloat(contract.total_price)),
        deposit: formatCurrency(parseFloat(contract.deposit_amount || 0)),
        isVatInclusive: contract.is_vat_inclusive,
      };
    });

    return new Response(
      JSON.stringify({ stands }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('fetch-customer-data error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
