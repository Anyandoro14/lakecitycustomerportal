import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  listCollectionScheduleDataTabTitles,
  quoteSheetRange,
  type SheetMeta,
} from "../_shared/collection-schedule-sheets.ts";
import { getGoogleSheetsAccessToken } from "../_shared/google-sheets-auth.ts";
import {
  getLakecityLoanApi,
  getSupabaseServiceClient,
  lakecityListLoans,
} from "../_shared/odoo-loan-http.ts";
import {
  parseMoney,
  reconcileLedgers,
  type LedgerAmounts,
  type ReconciliationResult,
} from "../_shared/balance-reconciliation.ts";
import {
  buildReconciliationCsv,
  buildReconciliationEmailHtml,
} from "../_shared/balance-reconciliation-report.ts";
import {
  DEFAULT_MASTER_SALES_SPREADSHEET_ID,
  MASTER_SALES_WORKBOOK_URL,
  findSheetTitleByGidOrName,
  parseSheetLedgerRows,
  resolveMasterSalesConfig,
} from "../_shared/balance-reconciliation-sheets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function isJunkStand(stand: string): boolean {
  const u = stand.trim().toUpperCase();
  return !u || u === "TOTAL" || u === "TOTALS" || u === "STAND NUMBER" || u === "STAND" || u === "N/A";
}

async function fetchSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string,
): Promise<SheetMeta[]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `?fields=sheets.properties(title,sheetId)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Failed to list spreadsheet ${spreadsheetId}: ${res.status}`);
  }
  const metaJson = await res.json();
  return (metaJson.sheets || []) as SheetMeta[];
}

async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  title: string,
): Promise<string[][]> {
  const range = encodeURIComponent(quoteSheetRange(title, "A1:IZ5000"));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.warn(`Sheet tab "${title}" failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.values as string[][]) || [];
}

async function pullMasterSalesRows(
  accessToken: string,
  notes: string[],
): Promise<{ rows: LedgerAmounts[]; label: string; found: boolean }> {
  const cfg = resolveMasterSalesConfig(Deno.env);
  try {
    const metas = await fetchSpreadsheetMeta(accessToken, cfg.spreadsheetId);
    const title = findSheetTitleByGidOrName(metas, { gid: cfg.gid, title: cfg.title });
    if (!title) {
      notes.push(
        `Master Sales workbook ${cfg.spreadsheetId} has no tab for gid ${cfg.gid}` +
          (cfg.title ? ` or title "${cfg.title}"` : "") +
          ".",
      );
      return { rows: [], label: "Master Sales (not found)", found: false };
    }
    const values = await fetchSheetValues(accessToken, cfg.spreadsheetId, title);
    const rows = parseSheetLedgerRows(values, title);
    const label = `Master Sales (${title}, gid ${cfg.gid})`;
    notes.push(
      `Master Sales pulled from ${MASTER_SALES_WORKBOOK_URL} tab "${title}" (${rows.length} stand row(s)).`,
    );
    return { rows, label, found: rows.length > 0 || values.length > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notes.push(
      `Master Sales workbook ${cfg.spreadsheetId} could not be read: ${msg}. ` +
        "Share the sheet with the Google service account, or set MASTER_SALES_SPREADSHEET_ID.",
    );
    return { rows: [], label: "Master Sales (unavailable)", found: false };
  }
}

async function isAuthorizedCaller(
  supabaseUrl: string,
  serviceKey: string,
  bearer: string,
): Promise<{ ok: boolean; email?: string }> {
  if (!bearer) return { ok: false };
  const cronSecret = (Deno.env.get("RECONCILIATION_CRON_SECRET") || "").trim();
  if (cronSecret && bearer === cronSecret) return { ok: true, email: "cron" };
  if (bearer === serviceKey) return { ok: true, email: "service_role" };

  const ac = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await ac.auth.getUser(bearer);
  if (error || !user) return { ok: false };

  const email = (user.email || "").toLowerCase();
  const { data: internal } = await ac
    .from("internal_users")
    .select("id, email, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (internal) return { ok: true, email };
  if (email.endsWith("@lakecity.co.zw")) return { ok: true, email };
  return { ok: false };
}

async function resolveTenant(supabase: ReturnType<typeof createClient>, slug?: string) {
  const wanted = (slug || Deno.env.get("TENANT_SLUG") || "lakecity").trim();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, display_name, spreadsheet_id")
    .eq("slug", wanted)
    .maybeSingle();
  if (error || !data) throw new Error(`Tenant not found: ${wanted}`);
  return data as { id: string; slug: string; display_name: string; spreadsheet_id: string | null };
}

async function pullOdoo(tenantId: string, supabase: ReturnType<typeof createClient>): Promise<LedgerAmounts[]> {
  const { origin, token } = await getLakecityLoanApi(tenantId, supabase);
  const rows: LedgerAmounts[] = [];
  const page = 500;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const batch = await lakecityListLoans(origin, token, { limit: page, offset });
    total = batch.count;
    for (const c of batch.contracts) {
      const stand = (c.stand_number || "").toString().trim().toUpperCase();
      if (isJunkStand(stand)) continue;
      const totalPrice = parseMoney(c.total_with_tax || c.total_price);
      rows.push({
        standNumber: stand,
        customerName: c.partner_name || "",
        email: c.partner_email || "",
        totalPrice,
        deposit: parseMoney(c.deposit_amount),
        totalPaid: parseMoney(c.total_paid),
        currentBalance: parseMoney(c.current_balance),
        extras: {
          odoo_state: c.state || "",
          odoo_total_price_net: parseMoney(c.total_price),
          odoo_partner_credit: parseMoney(c.partner_credit),
        },
      });
    }
    offset += batch.contracts.length;
    if (batch.contracts.length === 0) break;
  }
  return rows;
}

async function pullPortalLedger(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<LedgerAmounts[]> {
  const pageSize = 1000;
  const out: LedgerAmounts[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("contract_balances")
      .select("stand_number, total_price, deposit_amount, total_paid, current_balance, customer_id")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("contract_balances query failed:", error.message);
      break;
    }
    const chunk = data || [];
    const customerIds = [...new Set(chunk.map((r: { customer_id?: string }) => r.customer_id).filter(Boolean))];
    let names = new Map<string, { full_name?: string; email?: string }>();
    if (customerIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", customerIds);
      names = new Map((profiles || []).map((p: { id: string; full_name?: string; email?: string }) => [p.id, p]));
    }
    for (const row of chunk) {
      const stand = (row.stand_number || "").toString().trim().toUpperCase();
      if (isJunkStand(stand)) continue;
      const profile = row.customer_id ? names.get(row.customer_id) : undefined;
      out.push({
        standNumber: stand,
        customerName: profile?.full_name || "",
        email: profile?.email || "",
        totalPrice: parseMoney(row.total_price),
        deposit: parseMoney(row.deposit_amount),
        totalPaid: parseMoney(row.total_paid),
        currentBalance: parseMoney(row.current_balance),
      });
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function reportRecipients(override?: string[]): string[] {
  if (override?.length) return override;
  const env = Deno.env.get("RECONCILIATION_REPORT_EMAILS") || "";
  const fromEnv = env.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return ["accounts@lakecity.co.zw", "alex@lakecity.co.zw"];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getSupabaseServiceClient();

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const caller = await isAuthorizedCaller(supabaseUrl, serviceKey, bearer);
    if (!caller.ok) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      tenantSlug?: string;
      sendEmail?: boolean;
      dryRun?: boolean;
      scheduled?: boolean;
      source?: string;
      tolerance?: number;
      emailTo?: string[];
    };

    const sendEmail = body.sendEmail !== false;
    const dryRun = body.dryRun === true;
    const tenant = await resolveTenant(supabase, body.tenantSlug);
    const notes: string[] = [];
    const asOf = new Date().toISOString();

    const spreadsheetId = tenant.spreadsheet_id || Deno.env.get("SPREADSHEET_ID") || "";
    if (!spreadsheetId) throw new Error("No spreadsheet_id on tenant and SPREADSHEET_ID is not set");

    const accessToken = await getGoogleSheetsAccessToken();
    const sheetMetas = await fetchSpreadsheetMeta(accessToken, spreadsheetId);
    const scheduleTabs = listCollectionScheduleDataTabTitles(sheetMetas);

    const collectionRows: LedgerAmounts[] = [];
    const seenCollection = new Set<string>();
    for (const title of scheduleTabs) {
      const values = await fetchSheetValues(accessToken, spreadsheetId, title);
      for (const row of parseSheetLedgerRows(values, title)) {
        if (seenCollection.has(row.standNumber)) continue;
        seenCollection.add(row.standNumber);
        collectionRows.push(row);
      }
    }

    const master = await pullMasterSalesRows(accessToken, notes);
    let sheetsRows: LedgerAmounts[] = collectionRows;
    let sheetsLabel = `Collection Schedule (${scheduleTabs.join(", ") || "none"})`;
    const masterSalesFound = master.found && master.rows.length > 0;

    if (masterSalesFound) {
      sheetsRows = master.rows;
      sheetsLabel = master.label;
      notes.push(
        "StandLedger column is the Collection Schedule (customer-visible dashboard). Master Sales is the dedicated sales register workbook.",
      );
    } else if (master.rows.length === 0) {
      notes.push(
        `Master Sales list was empty or unreadable (default workbook ${DEFAULT_MASTER_SALES_SPREADSHEET_ID}). Collection Schedule is used as the sales register for this run.`,
      );
    }

    let odooRows: LedgerAmounts[] = [];
    try {
      odooRows = await pullOdoo(tenant.id, supabase);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`Odoo pull failed: ${msg}. Report compares remaining sources only.`);
      console.error("Odoo pull failed:", msg);
    }

    const portalDb = await pullPortalLedger(supabase, tenant.id);
    let standledgerRows: LedgerAmounts[];
    if (masterSalesFound) {
      standledgerRows = collectionRows.length > 0 ? collectionRows : portalDb;
    } else if (portalDb.length > 0) {
      standledgerRows = portalDb;
      notes.push(
        "StandLedger column is the portal database ledger (contract_balances from approved payment_receipts). The live customer dashboard still reads Collection Schedule Current Balance.",
      );
    } else {
      standledgerRows = collectionRows;
      notes.push(
        "StandLedger portal database has no contract_balances rows; customer-visible balances are the Collection Schedule (same figures as Master Sales in this run).",
      );
    }

    const result: ReconciliationResult = reconcileLedgers(sheetsRows, odooRows, standledgerRows, {
      asOf,
      tolerance: body.tolerance,
    });

    let runId: string | null = null;
    let emailSent = false;
    const recipients = reportRecipients(body.emailTo);

    if (!dryRun) {
      const { data: run, error: runErr } = await supabase
        .from("balance_reconciliation_runs")
        .insert({
          tenant_id: tenant.id,
          as_of: asOf,
          status: "completed",
          source: body.source || (body.scheduled ? "scheduled" : "manual"),
          sheets_label: sheetsLabel,
          sheets_count: result.summary.sheetsCount,
          odoo_count: result.summary.odooCount,
          standledger_count: result.summary.standledgerCount,
          stands_compared: result.summary.standsCompared,
          matched: result.summary.matched,
          variances: result.summary.variances,
          missing_source: result.summary.missingSource,
          positive_discrepancies: result.summary.positiveDiscrepancies,
          negative_discrepancies: result.summary.negativeDiscrepancies,
          abs_variance_total: result.summary.absVarianceTotal,
          tolerance: result.summary.tolerance,
          email_to: sendEmail ? recipients : [],
          email_sent: false,
          notes,
        })
        .select("id")
        .single();
      if (runErr) {
        console.error("Failed to persist run:", runErr);
      } else {
        runId = run.id;
        const rowPayload = result.rows.map((r) => ({
          run_id: runId,
          tenant_id: tenant.id,
          stand_number: r.standNumber,
          customer_name: r.customerName,
          status: r.status,
          likely_source: r.likelySource,
          likely_cause: r.likelyCause,
          sheets_price: r.sheets?.totalPrice ?? null,
          sheets_deposit: r.sheets?.deposit ?? null,
          sheets_paid: r.sheets?.totalPaid ?? null,
          sheets_balance: r.sheets?.currentBalance ?? null,
          odoo_price: r.odoo?.totalPrice ?? null,
          odoo_deposit: r.odoo?.deposit ?? null,
          odoo_paid: r.odoo?.totalPaid ?? null,
          odoo_balance: r.odoo?.currentBalance ?? null,
          standledger_price: r.standledger?.totalPrice ?? null,
          standledger_deposit: r.standledger?.deposit ?? null,
          standledger_paid: r.standledger?.totalPaid ?? null,
          standledger_balance: r.standledger?.currentBalance ?? null,
          sheets_vs_odoo: r.sheetsVsOdooBalance,
          sheets_vs_standledger: r.sheetsVsStandledgerBalance,
          odoo_vs_standledger: r.odooVsStandledgerBalance,
        }));
        const chunk = 500;
        for (let i = 0; i < rowPayload.length; i += chunk) {
          const { error: rowErr } = await supabase
            .from("balance_reconciliation_rows")
            .insert(rowPayload.slice(i, i + chunk));
          if (rowErr) console.error("Failed to persist recon rows:", rowErr);
        }
      }
    }

    if (sendEmail && !dryRun) {
      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) {
        notes.push("RESEND_API_KEY is not configured; email was not sent.");
      } else {
        const generatedAt = new Date(asOf).toLocaleString("en-ZW", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: "Africa/Harare",
        });
        const html = buildReconciliationEmailHtml(result, {
          tenantName: tenant.display_name || "LakeCity",
          sheetsLabel,
          generatedAt,
          extraNotes: notes,
        });
        const csv = buildReconciliationCsv(result);
        const resend = new Resend(apiKey);
        const fromAddr = Deno.env.get("RECONCILIATION_FROM_EMAIL") || "LakeCity <noreply@lakecity.co.zw>";
        const subject =
          result.summary.variances + result.summary.missingSource > 0
            ? `Balance reconciliation: ${result.summary.variances} variance(s), ${result.summary.missingSource} missing — ${generatedAt}`
            : `Balance reconciliation: all ${result.summary.matched} stands matched — ${generatedAt}`;

        const emailResponse = await resend.emails.send({
          from: fromAddr,
          to: recipients,
          subject,
          html,
          attachments: [
            {
              filename: `balance-reconciliation-${asOf.slice(0, 10)}.csv`,
              content: btoa(unescape(encodeURIComponent(csv))),
            },
          ],
        });
        console.log("Reconciliation email sent:", emailResponse);
        emailSent = true;
        if (runId) {
          await supabase
            .from("balance_reconciliation_runs")
            .update({ email_sent: true, email_to: recipients })
            .eq("id", runId);
        }
      }
    }

    return json({
      success: true,
      dryRun,
      runId,
      emailSent,
      emailTo: sendEmail ? recipients : [],
      sheetsLabel,
      notes,
      summary: result.summary,
      discrepancies: result.rows.filter((r) => r.status !== "match"),
    });
  } catch (error) {
    console.error("reconcile-account-balances failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
