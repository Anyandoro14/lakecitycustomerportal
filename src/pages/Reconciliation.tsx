import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Scale, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import InternalNav from "@/components/InternalNav";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

type RunSummary = {
  id: string;
  as_of: string;
  sheets_label: string | null;
  sheets_count: number;
  odoo_count: number;
  standledger_count: number;
  stands_compared: number;
  matched: number;
  variances: number;
  missing_source: number;
  positive_discrepancies: number;
  negative_discrepancies: number;
  abs_variance_total: number;
  email_sent: boolean;
  notes: string[] | null;
};

type RunRow = {
  id: string;
  stand_number: string;
  customer_name: string | null;
  status: string;
  likely_source: string | null;
  likely_cause: string | null;
  sheets_balance: number | null;
  odoo_balance: number | null;
  standledger_balance: number | null;
  sheets_vs_odoo: number | null;
  sheets_vs_standledger: number | null;
  odoo_vs_standledger: number | null;
};

const money = (n: number | null | undefined) => {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

const signed = (n: number | null | undefined) => {
  if (n == null) return "—";
  const abs = money(Math.abs(n));
  if (n > 0.01) return `+${abs}`;
  if (n < -0.01) return `−${abs}`;
  return money(0);
};

const deltaClass = (n: number | null | undefined) => {
  if (n == null || Math.abs(n) <= 0.01) return "text-emerald-700";
  if (n > 0) return "text-orange-700 font-semibold";
  return "text-rose-700 font-semibold";
};

const Reconciliation = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [lastInvoke, setLastInvoke] = useState<{ emailTo?: string[]; notes?: string[] } | null>(null);

  const loadLatest = useCallback(async () => {
    const { data: runs, error } = await supabase
      .from("balance_reconciliation_runs")
      .select("*")
      .order("as_of", { ascending: false })
      .limit(1);
    if (error) {
      console.error(error);
      return;
    }
    const latest = (runs?.[0] as RunSummary | undefined) || null;
    setRun(latest);
    if (!latest) {
      setRows([]);
      return;
    }
    const { data: issueRows, error: rowErr } = await supabase
      .from("balance_reconciliation_rows")
      .select(
        "id, stand_number, customer_name, status, likely_source, likely_cause, sheets_balance, odoo_balance, standledger_balance, sheets_vs_odoo, sheets_vs_standledger, odoo_vs_standledger",
      )
      .eq("run_id", latest.id)
      .neq("status", "match")
      .order("stand_number");
    if (rowErr) {
      console.error(rowErr);
      return;
    }
    setRows((issueRows as RunRow[]) || []);
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Please log in to access reconciliation");
          navigate("/login");
          return;
        }
        const { data, error } = await supabase.functions.invoke("check-reporting-access");
        if (error) throw error;
        if (!data?.hasAccess) {
          toast.error("Access denied. Directors and Super Admins only.");
          navigate("/");
          return;
        }
        setHasAccess(true);
        setIsSuperAdmin(!!data.isSuperAdmin);
        setIsDirector(!!data.isDirector);
        await loadLatest();
      } catch (err) {
        console.error(err);
        toast.error("Failed to verify access");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [loadLatest, navigate]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-account-balances", {
        body: { sendEmail: true, source: "manual_ui" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.emailSent
          ? `Reconciliation complete. Email sent to ${(data.emailTo || []).join(", ")}.`
          : "Reconciliation complete.",
      );
      setLastInvoke({ emailTo: data?.emailTo, notes: data?.notes });
      await loadLatest();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Reconciliation failed";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-primary text-primary-foreground p-4 md:p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold">Balance reconciliation</h1>
            <p className="text-sm md:text-base text-primary-foreground/80">
              Master Sales (Google Sheets) · Odoo · StandLedger — every 7 days
            </p>
          </div>
          <InternalNav isSuperAdmin={isSuperAdmin} isDirector={isDirector} currentPage="reconciliation" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Weekly three-way match
              </CardTitle>
              <CardDescription>
                Positive (orange) = left source outstanding is higher. Negative (rose) = left source outstanding is lower.
                The likely-cause column points at deposits, receipts, sale price, or a missing record.
              </CardDescription>
            </div>
            <Button onClick={runNow} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run now and email report
            </Button>
          </CardHeader>
        </Card>

        {run ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground">Matched</p>
                <p className="text-2xl font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  {run.matched}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground">Variances</p>
                <p className="text-2xl font-bold text-orange-700">{run.variances}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground">Missing source</p>
                <p className="text-2xl font-bold text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {run.missing_source}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground">Last run</p>
                <p className="text-sm font-medium">{new Date(run.as_of).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sheets {run.sheets_count} · Odoo {run.odoo_count} · StandLedger {run.standledger_count}
                </p>
                {run.email_sent && (
                  <Badge variant="secondary" className="mt-2">
                    <Mail className="h-3 w-3 mr-1" />
                    Email sent
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-muted-foreground">
              No reconciliation has been stored yet. Run now to pull Master Sales, Odoo, and StandLedger and email the table.
            </CardContent>
          </Card>
        )}

        {run?.sheets_label && (
          <p className="text-sm text-muted-foreground">Sales register: {run.sheets_label}</p>
        )}
        {lastInvoke?.notes?.length ? (
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {lastInvoke.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Discrepancies</CardTitle>
            <CardDescription>
              Orange amounts are positive (sheet/left higher). Rose amounts are negative (sheet/left lower).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {rows.length === 0 ? (
              <p className="text-sm text-emerald-700 font-medium">No discrepancies on the latest run.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stand</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sheets</TableHead>
                    <TableHead className="text-right">Odoo</TableHead>
                    <TableHead className="text-right">StandLedger</TableHead>
                    <TableHead className="text-right">Sheets − Odoo</TableHead>
                    <TableHead className="text-right">Sheets − StandLedger</TableHead>
                    <TableHead className="text-right">Odoo − StandLedger</TableHead>
                    <TableHead>Likely cause</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold whitespace-nowrap">{row.stand_number}</TableCell>
                      <TableCell>{row.customer_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "missing_source" ? "secondary" : "destructive"}>
                          {row.status === "missing_source" ? "Missing" : "Variance"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{money(row.sheets_balance)}</TableCell>
                      <TableCell className="text-right">{money(row.odoo_balance)}</TableCell>
                      <TableCell className="text-right">{money(row.standledger_balance)}</TableCell>
                      <TableCell className={`text-right ${deltaClass(row.sheets_vs_odoo)}`}>
                        {signed(row.sheets_vs_odoo)}
                      </TableCell>
                      <TableCell className={`text-right ${deltaClass(row.sheets_vs_standledger)}`}>
                        {signed(row.sheets_vs_standledger)}
                      </TableCell>
                      <TableCell className={`text-right ${deltaClass(row.odoo_vs_standledger)}`}>
                        {signed(row.odoo_vs_standledger)}
                      </TableCell>
                      <TableCell className="text-sm max-w-md">{row.likely_cause}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
};

export default Reconciliation;
