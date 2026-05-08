import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

interface RecentSync {
  id: string;
  stand_number: string;
  amount: number;
  payment_date: string;
  qc_status: string;
  gateway: string;
  gateway_reference: string | null;
  odoo_collection_payment_id: number | null;
  odoo_collection_schedule_id: number | null;
  odoo_payment_id: number | null;
  odoo_sync_status: string | null;
  created_at: string;
}

interface DriftRow {
  odoo_payment_id: number;
  stand_number: string;
  amount_paid: number;
  paid_date: string;
  due_date: string;
  schedule_id: number;
}

interface AuditPayload {
  ok: true;
  as_of: string;
  recent_syncs: RecentSync[];
  counts: {
    receipts_created_last_24h: number;
    odoo_payments_paid_last_24h: number;
    variance_last_24h: number;
    pending_qc: number;
  };
  drift_sample: DriftRow[];
  odoo_error: string | null;
}

const formatMoney = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qcBadgeVariant = (status: string) => {
  if (status === "approved") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "outline" as const;
};

const OdooAuditPage = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/internal-login");
        return;
      }
      const { data: internalUser } = await supabase
        .from("internal_users")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const allowed = ["admin", "super_admin", "director", "internal"];
      if (!internalUser || !allowed.includes(internalUser.role)) {
        navigate("/internal-portal");
        return;
      }
      if (active) setAuthChecked(true);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const { data, isLoading, error, refetch, isFetching } = useQuery<AuditPayload>({
    queryKey: ["odoo-audit-data"],
    enabled: authChecked,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<AuditPayload>(
        "odoo-audit-data",
        { body: {} }
      );
      if (error) throw error;
      if (!data) throw new Error("No data");
      return data;
    },
  });

  if (!authChecked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6 bg-background">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Could not load audit data
            </CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const counts = data?.counts;
  const variance = counts?.variance_last_24h ?? 0;
  const variancePositive = variance > 0;
  const varianceNegative = variance < 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Odoo Audit
            </h1>
            <p className="text-muted-foreground">
              Internal observability for the Odoo CRM cutover. As of{" "}
              {data?.as_of ? format(parseISO(data.as_of), "d MMM yyyy HH:mm") : "—"}.
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {data?.odoo_error && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Odoo lookup failed
              </CardTitle>
              <CardDescription className="text-amber-700/80 dark:text-amber-300/80">
                Database-side data is shown below; reconciliation against Odoo is
                unavailable for this refresh. Check Vault secrets and Odoo.sh
                availability. Error: {data.odoo_error}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* KPI cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Receipts in DB (24h)</CardDescription>
              <CardTitle className="text-3xl">
                {counts?.receipts_created_last_24h ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Odoo paid lines (24h)</CardDescription>
              <CardTitle className="text-3xl">
                {counts?.odoo_payments_paid_last_24h ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={
              Math.abs(variance) > 1
                ? "border-destructive"
                : "border-emerald-500/50"
            }
          >
            <CardHeader className="pb-2">
              <CardDescription>Variance (24h)</CardDescription>
              <CardTitle
                className={`text-3xl ${
                  variancePositive
                    ? "text-amber-600"
                    : varianceNegative
                      ? "text-destructive"
                      : "text-emerald-600"
                }`}
              >
                {variance > 0 ? `+${variance}` : variance}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Receipts − Odoo paid. ±1 is acceptable.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending QC</CardDescription>
              <CardTitle className="text-3xl">
                {counts?.pending_qc ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Drift sample */}
        <Card>
          <CardHeader>
            <CardTitle>Paid in Odoo, not yet in Supabase</CardTitle>
            <CardDescription>
              Lines paid in Odoo within the last 24h that have no matching
              <code className="px-1">payment_receipts</code> row. A non-empty list
              means the webhook is dropping events or hasn&apos;t fired yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.drift_sample.length === 0 ? (
              <p className="text-emerald-600 text-sm">
                No drift detected — every Odoo payment in the last 24h has a
                matching receipt.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Odoo Payment</TableHead>
                    <TableHead>Stand</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid On</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.drift_sample.map((row) => (
                    <TableRow key={row.odoo_payment_id}>
                      <TableCell className="font-mono text-xs">
                        #{row.odoo_payment_id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.stand_number}
                      </TableCell>
                      <TableCell>${formatMoney(row.amount_paid)}</TableCell>
                      <TableCell>
                        {row.paid_date
                          ? format(parseISO(row.paid_date), "d MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {row.due_date
                          ? format(parseISO(row.due_date), "d MMM yyyy")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent syncs */}
        <Card>
          <CardHeader>
            <CardTitle>Last 50 Odoo-origin receipts</CardTitle>
            <CardDescription>
              Receipts where <code className="px-1">gateway = odoo</code> or{" "}
              <code className="px-1">odoo_collection_payment_id</code> is set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.recent_syncs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">
                No Odoo-origin receipts yet. Once staff approves a payment in
                Odoo, the webhook will populate this list within seconds.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stand</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>QC</TableHead>
                      <TableHead>Sync</TableHead>
                      <TableHead>Odoo Line</TableHead>
                      <TableHead>Synced At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recent_syncs.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.stand_number}
                        </TableCell>
                        <TableCell>${formatMoney(row.amount)}</TableCell>
                        <TableCell>
                          {row.payment_date
                            ? format(parseISO(row.payment_date), "d MMM yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.gateway}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.gateway_reference || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={qcBadgeVariant(row.qc_status)}>
                            {row.qc_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.odoo_sync_status || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.odoo_collection_payment_id
                            ? `#${row.odoo_collection_payment_id}`
                            : row.odoo_payment_id
                              ? `legacy #${row.odoo_payment_id}`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.created_at
                            ? format(
                                parseISO(row.created_at),
                                "d MMM HH:mm"
                              )
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OdooAuditPage;
