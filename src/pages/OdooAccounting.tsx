import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import {
  formatDate,
  formatMoney,
  invoiceStateMeta,
  odooAccounting,
  paymentStateMeta,
  type InvoiceFilter,
} from "@/integrations/odoo/accounting";

/* ─────────────── Shared bits ─────────────── */

const toneClass = (tone: "ok" | "warn" | "info" | "muted") =>
  ({
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
    muted: "bg-slate-50 text-slate-600 border-slate-200",
  })[tone];

// Odoo 19 account.payment.state ∈ {draft, in_process, paid, canceled, rejected}.
const odooPaymentLabel = (state: string) => {
  switch (state) {
    case "in_process":
      return "In Process";
    case "paid":
      return "Paid";
    case "draft":
      return "Draft";
    case "canceled":
      return "Canceled";
    case "rejected":
      return "Rejected";
    default:
      return state ? state.charAt(0).toUpperCase() + state.slice(1) : "—";
  }
};

const odooPaymentTone = (state: string): "ok" | "warn" | "info" | "muted" => {
  switch (state) {
    case "paid":
      return "ok";
    case "in_process":
      return "info";
    case "rejected":
      return "warn";
    case "draft":
    case "canceled":
    default:
      return "muted";
  }
};

const StatusPill = ({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "info" | "muted";
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      toneClass(tone),
    )}
  >
    {label}
  </span>
);

const KpiCard = ({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "warn" | "ok";
}) => {
  const accent =
    tone === "warn"
      ? "from-amber-500/10 to-amber-500/0 text-amber-700"
      : tone === "ok"
        ? "from-emerald-500/10 to-emerald-500/0 text-emerald-700"
        : "from-[hsl(160,70%,15%)]/10 to-[hsl(160,70%,15%)]/0 text-[hsl(160,70%,15%)]";
  return (
    <Card className="overflow-hidden border-[hsl(160,10%,90%)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-3 h-7 w-32" />
            ) : (
              <p className="mt-2 text-2xl font-bold text-[hsl(160,70%,15%)]">{value}</p>
            )}
            {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("rounded-xl bg-gradient-to-br p-2.5", accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ErrorState = ({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) => {
  const message = error instanceof Error ? error.message : "Failed to load data";
  const notConfigured = /not configured|Missing Vault secret/i.test(message);
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">
              {notConfigured ? "Odoo isn't connected for this tenant yet" : "Couldn't reach Odoo"}
            </p>
            <p className="text-sm text-amber-800/80">{message}</p>
            {notConfigured && (
              <p className="mt-1 text-xs text-amber-800/70">
                Add <code className="rounded bg-amber-100 px-1">odoo_url</code>,{" "}
                <code className="rounded bg-amber-100 px-1">odoo_db</code>,{" "}
                <code className="rounded bg-amber-100 px-1">odoo_uid</code>, and{" "}
                <code className="rounded bg-amber-100 px-1">odoo_api_key</code> to Supabase Vault
                (suffixed by <code className="rounded bg-amber-100 px-1">_&lt;tenant_id&gt;</code>).
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
};

const TableSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-11 w-full" />
    ))}
  </div>
);

/* ─────────────── Dashboard tab ─────────────── */

const DashboardTab = () => {
  const q = useQuery({
    queryKey: ["odoo-accounting", "dashboard"],
    queryFn: () => odooAccounting.dashboard(),
    staleTime: 30_000,
  });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const currency = d?.currency || "USD";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Total Receivable"
          value={d ? formatMoney(d.total_receivable, currency) : "—"}
          hint={d ? `${d.open_invoice_count} open invoice${d.open_invoice_count === 1 ? "" : "s"}` : ""}
          loading={q.isLoading}
        />
        <KpiCard
          icon={Clock}
          label="Overdue"
          value={d ? formatMoney(d.overdue_amount, currency) : "—"}
          hint={d ? `${d.overdue_count} past due` : ""}
          loading={q.isLoading}
          tone="warn"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Collected (MTD)"
          value={d ? formatMoney(d.collected_this_month, currency) : "—"}
          hint={d ? `${d.payment_count_this_month} payment${d.payment_count_this_month === 1 ? "" : "s"}` : ""}
          loading={q.isLoading}
          tone="ok"
        />
        <KpiCard
          icon={Calendar}
          label="As of"
          value={d ? formatDate(d.as_of) : "—"}
          hint="Live from Odoo"
          loading={q.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>Jump straight to the work that matters today.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink
            icon={FileText}
            label="Review open invoices"
            sub={d ? `${d.open_invoice_count} open` : ""}
            tab="invoices"
          />
          <QuickLink
            icon={AlertCircle}
            label="Chase overdue"
            sub={d ? `${d.overdue_count} accounts` : ""}
            tab="aged"
            tone="warn"
          />
          <QuickLink
            icon={DollarSign}
            label="Recent payments"
            sub={d ? `${d.payment_count_this_month} this month` : ""}
            tab="payments"
            tone="ok"
          />
        </CardContent>
      </Card>
    </div>
  );
};

const QuickLink = ({
  icon: Icon,
  label,
  sub,
  tab,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  tab: string;
  tone?: "default" | "warn" | "ok";
}) => {
  const accent =
    tone === "warn"
      ? "text-amber-700 group-hover:bg-amber-50"
      : tone === "ok"
        ? "text-emerald-700 group-hover:bg-emerald-50"
        : "text-[hsl(160,70%,15%)] group-hover:bg-[hsl(160,20%,75%)]/30";
  return (
    <button
      type="button"
      onClick={() => {
        const trigger = document.querySelector<HTMLButtonElement>(`[data-odoo-tab="${tab}"]`);
        trigger?.click();
      }}
      className="group flex items-center justify-between rounded-xl border border-[hsl(160,10%,90%)] p-4 text-left transition-colors hover:border-[hsl(160,30%,55%)]"
    >
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2 transition-colors", accent)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(160,70%,15%)]">{label}</p>
          <p className="text-xs text-muted-foreground">{sub || "—"}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
};

/* ─────────────── Invoices tab ─────────────── */

const InvoicesTab = () => {
  const [filter, setFilter] = useState<InvoiceFilter>("open");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: ["odoo-accounting", "invoices", filter, debounced],
    queryFn: () => odooAccounting.invoices({ state: filter, search: debounced || undefined, limit: 50 }),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice # or customer…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as InvoiceFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {q.isLoading ? (
              <div className="p-6">
                <TableSkeleton />
              </div>
            ) : q.data && q.data.invoices.length === 0 ? (
              <EmptyState message="No invoices match this view." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Invoice date</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data?.invoices.map((inv) => {
                      const ps = paymentStateMeta(inv.payment_state);
                      const ss = invoiceStateMeta(inv.state);
                      const isOverdue =
                        inv.due_date &&
                        inv.due_date < new Date().toISOString().slice(0, 10) &&
                        inv.amount_residual > 0;
                      return (
                        <TableRow key={inv.id} className="hover:bg-[hsl(160,20%,75%)]/15">
                          <TableCell className="font-medium">{inv.number || `#${inv.id}`}</TableCell>
                          <TableCell className="max-w-[260px] truncate">{inv.partner_name || "—"}</TableCell>
                          <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                          <TableCell className={cn(isOverdue && "text-amber-700 font-medium")}>
                            {formatDate(inv.due_date)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(inv.amount_total, inv.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(inv.amount_residual, inv.currency)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <StatusPill label={ss.label} tone={ss.tone} />
                              {inv.state === "posted" && <StatusPill label={ps.label} tone={ps.tone} />}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ─────────────── Payments tab ─────────────── */

const PaymentsTab = () => {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: ["odoo-accounting", "payments", debounced],
    queryFn: () => odooAccounting.payments({ search: debounced || undefined, limit: 50 }),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by payment ref or customer…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {q.isLoading ? (
              <div className="p-6">
                <TableSkeleton />
              </div>
            ) : q.data && q.data.payments.length === 0 ? (
              <EmptyState message="No customer payments yet." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data?.payments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-[hsl(160,20%,75%)]/15">
                        <TableCell className="font-medium">{p.number || `#${p.id}`}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{p.partner_name || "—"}</TableCell>
                        <TableCell>{formatDate(p.date)}</TableCell>
                        <TableCell className="text-muted-foreground">{p.journal || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(p.amount, p.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusPill
                            label={odooPaymentLabel(p.state)}
                            tone={odooPaymentTone(p.state)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ─────────────── Aged Receivables tab ─────────────── */

const AgedTab = () => {
  const q = useQuery({
    queryKey: ["odoo-accounting", "aged"],
    queryFn: () => odooAccounting.agedReceivables(),
    staleTime: 60_000,
  });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const data = q.data;
  const currency = data?.currency || "USD";
  const total = data?.buckets.reduce((s, b) => s + b.total, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(data?.buckets ?? Array.from({ length: 5 }).map((_, i) => null)).map((b, i) =>
          b ? (
            <Card key={b.key}>
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {b.label}
                </p>
                <p className="mt-2 text-xl font-bold text-[hsl(160,70%,15%)] tabular-nums">
                  {formatMoney(b.total, currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.count} invoice{b.count === 1 ? "" : "s"} · {percent(b.total, total)}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By customer</CardTitle>
          <CardDescription>
            {data
              ? `${data.customers.length} customer${data.customers.length === 1 ? "" : "s"} with open balance · as of ${formatDate(data.as_of)}`
              : "Loading customer rollup…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-6">
              <TableSkeleton />
            </div>
          ) : data && data.customers.length === 0 ? (
            <EmptyState message="No outstanding receivables. Nice." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Not due</TableHead>
                    <TableHead className="text-right">1–30</TableHead>
                    <TableHead className="text-right">31–60</TableHead>
                    <TableHead className="text-right">61–90</TableHead>
                    <TableHead className="text-right">90+</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.customers.map((c) => (
                    <TableRow
                      key={`${c.partner_id ?? "none"}-${c.partner_name}`}
                      className="hover:bg-[hsl(160,20%,75%)]/15"
                    >
                      <TableCell className="max-w-[280px] truncate font-medium">
                        {c.partner_name}
                      </TableCell>
                      <Money v={c.not_due} c={currency} />
                      <Money v={c.d_0_30} c={currency} />
                      <Money v={c.d_31_60} c={currency} warn={c.d_31_60 > 0} />
                      <Money v={c.d_61_90} c={currency} warn={c.d_61_90 > 0} />
                      <Money v={c.d_90_plus} c={currency} warn={c.d_90_plus > 0} bold />
                      <Money v={c.total} c={currency} bold />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Money = ({
  v,
  c,
  warn,
  bold,
}: {
  v: number;
  c: string;
  warn?: boolean;
  bold?: boolean;
}) => (
  <TableCell
    className={cn(
      "text-right tabular-nums",
      v === 0 && "text-muted-foreground/60",
      warn && "text-amber-700",
      bold && "font-semibold",
    )}
  >
    {v === 0 ? "—" : formatMoney(v, c)}
  </TableCell>
);

const percent = (part: number, whole: number) => {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
    <FileText className="h-8 w-8 text-muted-foreground/60" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

/* ─────────────── Page shell ─────────────── */

const OdooAccounting = () => {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-[hsl(160,10%,90%)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:flex"
            >
              <ArrowLeft className="h-4 w-4" />
              <img src={logoWordmark} alt="StandLedger" className="h-6" />
            </Link>
            <div className="hidden h-6 w-px bg-[hsl(160,10%,90%)] sm:block" />
            <div>
              <h1 className="text-lg font-bold text-[hsl(160,70%,15%)] sm:text-xl">
                Odoo Accounting
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Customer invoices, payments and receivables — live from Odoo
              </p>
            </div>
          </div>
          <a
            href="https://www.odoo.com/documentation/17.0/applications/finance/accounting.html"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 rounded-full border border-[hsl(160,10%,90%)] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-[hsl(160,30%,55%)] hover:text-foreground sm:inline-flex"
          >
            Odoo docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 sm:w-auto">
            <TabsTrigger value="dashboard" data-odoo-tab="dashboard">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="invoices" data-odoo-tab="invoices">
              Invoices
            </TabsTrigger>
            <TabsTrigger value="payments" data-odoo-tab="payments">
              Payments
            </TabsTrigger>
            <TabsTrigger value="aged" data-odoo-tab="aged">
              Aged AR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="m-0">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="invoices" className="m-0">
            <InvoicesTab />
          </TabsContent>
          <TabsContent value="payments" className="m-0">
            <PaymentsTab />
          </TabsContent>
          <TabsContent value="aged" className="m-0">
            <AgedTab />
          </TabsContent>
        </Tabs>

        <p className="mt-10 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ArrowUpRight className="h-3 w-3" />
          v1 — read-only. Posting actions (record payment, send invoice) ship in v2.
        </p>
      </main>
    </div>
  );
};

export default OdooAccounting;
