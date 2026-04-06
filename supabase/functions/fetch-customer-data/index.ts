import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  stand_number: string | null;
  payment_start_date: string | null;
};

type ContractRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  stand_number: string;
  total_price: number;
  monthly_installment: number;
  payment_start_date: string;
  deposit_amount: number | null;
  currency: string;
  is_vat_inclusive: boolean | null;
  agreement_signed_seller: boolean | null;
  agreement_signed_buyer: boolean | null;
  agreement_file_url: string | null;
  term_months: number;
  profiles: ProfileRow | ProfileRow[] | null;
};

type InstallmentRow = {
  id: string;
  contract_id: string;
  due_date: string;
  amount: number;
  status: string;
};

type ReceiptRow = {
  amount: number;
  payment_date: string;
  gateway_reference: string | null;
  gateway_metadata: Record<string, unknown> | null;
};

type BalanceRow = {
  contract_id: string;
  total_paid: number;
  current_balance: number;
  progress_percentage: number | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
};

const normalizeEmail = (value: unknown) =>
  (value ?? "").toString().trim().toLowerCase().replace(/\s+/g, "");

const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const displayDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

function unwrapProfile(c: ContractRow): ProfileRow {
  const p = c.profiles;
  if (Array.isArray(p)) return p[0] || {};
  return p || {};
}

function buildPaymentHistory(
  depositAmount: number,
  receipts: ReceiptRow[],
  currency: string,
): Array<{
  date: string;
  amount: string;
  principal: string;
  interest: string;
  vat: string;
  total: string;
  reference?: string;
  payment_method?: string;
}> {
  const history: Array<{
    date: string;
    amount: string;
    principal: string;
    interest: string;
    vat: string;
    total: string;
    reference?: string;
    payment_method?: string;
  }> = [];

  if (depositAmount > 0) {
    const s = formatMoney(depositAmount, currency);
    history.push({
      date: "Deposit",
      amount: s,
      principal: s,
      interest: formatMoney(0, currency),
      vat: formatMoney(0, currency),
      total: s,
      reference: "Initial Deposit",
      payment_method: "Deposit",
    });
  }

  const sorted = [...receipts].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
  );

  for (const r of sorted) {
    const s = formatMoney(Number(r.amount), currency);
    const meta = r.gateway_metadata || {};
    const method = typeof meta.payment_method === "string" ? meta.payment_method : undefined;
    history.push({
      date: displayDate(r.payment_date),
      amount: s,
      principal: s,
      interest: formatMoney(0, currency),
      vat: formatMoney(0, currency),
      total: s,
      reference: r.gateway_reference || undefined,
      payment_method: method,
    });
  }

  return history;
}

function computeStandPayload(
  contract: ContractRow,
  balance: BalanceRow | undefined,
  installments: InstallmentRow[],
  receipts: ReceiptRow[],
) {
  const profile = unwrapProfile(contract);
  const currency = contract.currency || "USD";
  const totalPriceNum = Number(contract.total_price);
  const monthlyNum = Number(contract.monthly_installment);
  const depositNum = Number(contract.deposit_amount ?? 0);

  const totalPaidNum = balance ? Number(balance.total_paid) : receipts.reduce((s, r) => s + Number(r.amount), 0);
  const currentBalNum = balance
    ? Number(balance.current_balance)
    : Math.max(0, totalPriceNum - totalPaidNum);

  const progressPercentage = balance?.progress_percentage != null
    ? Math.round(Number(balance.progress_percentage))
    : totalPriceNum > 0
    ? Math.round((totalPaidNum / totalPriceNum) * 100)
    : 0;

  const sortedInst = [...installments].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
  );
  const pending = sortedInst.filter((i) => i.status === "pending");

  const paymentStart = new Date(contract.payment_start_date);
  const startOk = !isNaN(paymentStart.getTime());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let paymentNotYetDue = false;
  if (startOk) {
    const startN = new Date(paymentStart);
    startN.setHours(0, 0, 0, 0);
    paymentNotYetDue = today < startN;
  }

  let nextPaymentDue = "";
  let nextPaymentAmountStr = formatMoney(monthlyNum, currency);
  let isOverdue = false;
  let daysOverdue = 0;

  const lastReceipt = receipts.length
    ? [...receipts].sort(
        (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
      )[0]
    : null;

  let lastPaymentAmount = lastReceipt ? formatMoney(Number(lastReceipt.amount), currency) : "";
  let lastPaymentDate = lastReceipt ? displayDate(lastReceipt.payment_date) : "";

  if (balance?.last_payment_amount != null && balance.last_payment_date) {
    lastPaymentAmount = formatMoney(Number(balance.last_payment_amount), currency);
    lastPaymentDate = displayDate(balance.last_payment_date);
  }

  if (paymentNotYetDue) {
    nextPaymentDue = startOk ? displayDate(contract.payment_start_date) : "";
    nextPaymentAmountStr = formatMoney(monthlyNum, currency);
  } else if (pending.length === 0) {
    nextPaymentDue = "";
    nextPaymentAmountStr = formatMoney(0, currency);
  } else {
    const next = pending[0];
    nextPaymentDue = displayDate(next.due_date);
    nextPaymentAmountStr = formatMoney(Number(next.amount), currency);
    const due = new Date(next.due_date);
    due.setHours(0, 0, 0, 0);
    if (today > due) {
      isOverdue = true;
      daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const totalPaidStr = formatMoney(totalPaidNum, currency);
  const standBalanceStr = formatMoney(currentBalNum, currency);
  const totalPriceStr = totalPriceNum > 0 ? formatMoney(totalPriceNum, currency) : "";
  const depositStr = depositNum > 0 ? formatMoney(depositNum, currency) : "";
  const monthlyPaymentStr = formatMoney(monthlyNum, currency);

  const fullName = (profile.full_name || "").trim();
  const paymentHistory = buildPaymentHistory(depositNum, receipts, currency);

  return {
    customerId: contract.stand_number || "",
    standNumber: contract.stand_number || "",
    customerName: fullName,
    customerCategory: "",
    customerPhone: profile.phone_number?.trim() || "",
    standBalance: standBalanceStr,
    lastPayment: lastPaymentAmount,
    lastPaymentDate,
    nextPayment: nextPaymentAmountStr,
    nextPaymentDate: nextPaymentDue,
    isOverdue,
    daysOverdue,
    paymentNotYetDue,
    paymentStartDate: startOk ? paymentStart.toISOString() : new Date().toISOString(),
    currentBalance: standBalanceStr,
    lastDueDate: contract.payment_start_date || "",
    monthlyPayment: monthlyPaymentStr,
    nextDueDate: nextPaymentDue,
    totalPaid: totalPaidStr,
    progressPercentage,
    paymentHistory,
    agreementSignedByWarwickshire: contract.agreement_signed_seller === true,
    agreementSignedByClient: contract.agreement_signed_buyer === true,
    agreementOfSaleFile: contract.agreement_file_url || null,
    totalPrice: totalPriceStr,
    deposit: depositStr,
    isVatInclusive: contract.is_vat_inclusive,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(userToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lookingGlassMode = false;
    let targetStandNumber: string | null = null;
    let requestBody: Record<string, unknown> = {};

    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        lookingGlassMode = requestBody.lookingGlassMode === true;
        targetStandNumber = (requestBody.targetStandNumber as string) || null;
      }
    } catch {
      // ignore
    }

    const requestTenantId = requestBody.tenant_id as string | undefined;
    if (!requestTenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, stand_number")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidateEmails = Array.from(
      new Set([profile.email, user.email].map(normalizeEmail).filter(Boolean)),
    );
    const profileStandNumber = profile.stand_number?.toString().trim().toUpperCase() || null;
    const hasPlaceholderEmail = candidateEmails.every((e) =>
      e.endsWith("@lakecity.portal") || e.includes("placeholder")
    );

    if (candidateEmails.length === 0 && !profileStandNumber) {
      return new Response(JSON.stringify({ error: "User email not available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const primaryEmail = candidateEmails[0] || "unknown";

    let isLookingGlassAdmin = false;
    if (lookingGlassMode && targetStandNumber) {
      const isStaff = candidateEmails.some((e) => e.endsWith("@lakecity.co.zw"));
      if (isStaff) {
        const { data: internalUser } = await supabaseClient
          .from("internal_users")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (internalUser) isLookingGlassAdmin = true;
      }
    }

    let contractsQuery = supabaseClient
      .from("contracts")
      .select(`
        *,
        profiles!contracts_customer_id_fkey ( full_name, email, phone_number, stand_number, payment_start_date )
      `)
      .eq("tenant_id", requestTenantId)
      .eq("status", "active");

    if (isLookingGlassAdmin && targetStandNumber) {
      contractsQuery = contractsQuery.ilike("stand_number", targetStandNumber.trim());
    } else {
      const standFilter = profileStandNumber
        ? `customer_id.eq.${user.id},stand_number.eq.${profileStandNumber}`
        : `customer_id.eq.${user.id}`;
      contractsQuery = contractsQuery.or(standFilter);
    }

    const { data: contracts, error: contractsError } = await contractsQuery;

    if (contractsError) {
      console.error("contractsError", contractsError);
      return new Response(JSON.stringify({ error: "Failed to load contracts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contracts?.length) {
      const msg = isLookingGlassAdmin && targetStandNumber
        ? `Stand ${targetStandNumber} not found`
        : `Your ${hasPlaceholderEmail && profileStandNumber ? `stand number ${profileStandNumber}` : `email (${primaryEmail})`} is not authorized to view any stand. Please contact support.`;
      return new Response(JSON.stringify({ error: msg }), {
        status: isLookingGlassAdmin ? 404 : 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contractIds = contracts.map((c: ContractRow) => c.id);
    const standNumbers = [...new Set(contracts.map((c: ContractRow) => c.stand_number))];

    const [{ data: balances }, { data: installments }, { data: receipts }] = await Promise.all([
      supabaseClient.from("contract_balances").select("*").in("contract_id", contractIds),
      supabaseClient.from("installments").select("*").in("contract_id", contractIds).order("due_date"),
      supabaseClient.from("payment_receipts").select(
        "amount, payment_date, gateway_reference, gateway_metadata, stand_number",
      ).eq("tenant_id", requestTenantId).eq("qc_status", "approved").in("stand_number", standNumbers),
    ]);

    const balanceByContract = new Map<string, BalanceRow>();
    for (const b of balances || []) {
      balanceByContract.set((b as BalanceRow).contract_id, b as BalanceRow);
    }

    const instByContract = new Map<string, InstallmentRow[]>();
    for (const row of installments || []) {
      const r = row as InstallmentRow;
      const list = instByContract.get(r.contract_id) || [];
      list.push(r);
      instByContract.set(r.contract_id, list);
    }

    const receiptsByStand = new Map<string, ReceiptRow[]>();
    for (const row of receipts || []) {
      const r = row as ReceiptRow & { stand_number: string };
      const key = r.stand_number?.toString().trim().toUpperCase() || "";
      const list = receiptsByStand.get(key) || [];
      list.push(r);
      receiptsByStand.set(key, list);
    }

    const stands = (contracts as ContractRow[]).map((c) => {
      const key = c.stand_number?.toString().trim().toUpperCase() || "";
      return computeStandPayload(
        c,
        balanceByContract.get(c.id),
        instByContract.get(c.id) || [],
        receiptsByStand.get(key) || [],
      );
    });

    return new Response(JSON.stringify({ stands }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
