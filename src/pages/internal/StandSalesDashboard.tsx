import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import InternalNav from "@/components/InternalNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { standSalesApi, type AgreementStaffRow, type AgreementStatus } from "@/lib/stand-sales/api";
import { AGREEMENT_STATUS_LABEL } from "@/lib/stand-sales/agreement-labels";
import { agreementReturnLine } from "@/lib/stand-sales/office";

interface QueueRow {
  reference: string;
  standNumber: string;
  status: string;
  cardStatus: number | null;
  createdAt: string;
  held: boolean;
  canDismiss: boolean;
}

const STATUS_FILTERS: Array<AgreementStatus | "all"> = ["all", "pending_review", "acknowledged", "dispatched", "return_submitted", "original_received", "countersigned", "action_required"];

export default function StandSalesDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [agreements, setAgreements] = useState<AgreementStaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AgreementStatus | "all">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "courier" | "in_person">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<AgreementStaffRow | null>(null);
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPayments() {
    const { data, error: queueError } = await supabase.functions.invoke("stand-sales", { body: { action: "staff-queue" } });
    if (queueError || data?.error) {
      setError(data?.error || queueError?.message || "Could not load the queue.");
      setRows([]);
      return;
    }
    setRows(data.rows ?? []);
    setError(null);
  }

  async function loadAgreements() {
    try {
      const result = await standSalesApi.staffAgreements();
      setAgreements(result.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agreements.");
      setAgreements([]);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userEmail = session?.user.email?.toLowerCase() || "";
      if (!session || !userEmail.endsWith("@lakecity.co.zw")) {
        navigate("/internal-login");
        return;
      }
      const { data: staff } = await supabase.from("internal_users").select("id").eq("user_id", session.user.id).maybeSingle();
      if (!staff) {
        navigate("/internal-login");
        return;
      }
      setEmail(userEmail);
      setReady(true);
      await loadPayments();
      await loadAgreements();
    })();
  }, [navigate]);

  async function dismiss(reference: string) {
    setError(null);
    try {
      await standSalesApi.staffDismiss(reference);
      await loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss that attempt.");
    }
  }

  async function runStaff(action: () => Promise<unknown>) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelected(null);
      setTracking("");
      setNote("");
      await loadAgreements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that agreement.");
    } finally {
      setBusy(false);
    }
  }

  const visibleAgreements = useMemo(() => {
    return (agreements ?? []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (methodFilter !== "all" && row.executionMethod !== methodFilter) return false;
      if (overdueOnly && !row.followUp?.due) return false;
      return true;
    });
  }, [agreements, statusFilter, methodFilter, overdueOnly]);

  if (!ready) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Checking staff access" /></div>;

  return (
    <div className="min-h-screen bg-background" data-testid="stand-sales-staff">
      <InternalNav currentPage="stand-sales" />
      <main className="container space-y-6 py-8">
        <div>
          <h1 className="font-display text-3xl">Stand sales</h1>
          <p className="text-sm text-muted-foreground">Signed in as {email}. Dismiss releases a buyer blocked by a held payment. Approved payments stay. Agreement alerts are queued for preview only.</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Tabs defaultValue="payments">
          <TabsList>
            <TabsTrigger value="payments">Payment Holds</TabsTrigger>
            <TabsTrigger value="agreements" data-testid="agreements-tab">Agreements & Courier</TabsTrigger>
          </TabsList>
          <TabsContent value="payments">
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Stand</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Card status</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>No payments need attention.</TableCell>
                      </TableRow>
                    )}
                    {(rows ?? []).map((row) => (
                      <TableRow key={row.reference} data-testid={`staff-row-${row.reference}`}>
                        <TableCell>{row.reference}</TableCell>
                        <TableCell>{row.standNumber}</TableCell>
                        <TableCell>{row.held ? "Held for Accounts" : row.status}</TableCell>
                        <TableCell>{row.cardStatus ?? "—"}</TableCell>
                        <TableCell>{row.createdAt?.slice(0, 16).replace("T", " ")}</TableCell>
                        <TableCell>
                          {row.canDismiss && <Button size="sm" variant="outline" onClick={() => void dismiss(row.reference)}>Dismiss</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="agreements">
            <div className="mb-4 flex flex-wrap gap-3 text-sm" data-testid="agreement-filters">
              <label className="space-y-1">
                <span className="block text-muted-foreground">Status</span>
                <select className="h-10 rounded-md border bg-background px-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AgreementStatus | "all")}>
                  {STATUS_FILTERS.map((status) => (
                    <option key={status} value={status}>{status === "all" ? "All statuses" : AGREEMENT_STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-muted-foreground">Method</span>
                <select className="h-10 rounded-md border bg-background px-2" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as "all" | "courier" | "in_person")}>
                  <option value="all">All methods</option>
                  <option value="courier">Courier</option>
                  <option value="in_person">In person</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
                Follow-up due
              </label>
            </div>
            <div className="space-y-3 md:hidden" data-testid="agreements-queue">
              {visibleAgreements.length === 0 && <p className="text-sm">No agreements match these filters.</p>}
              {visibleAgreements.map((row) => (
                <Card key={row.applicationId}>
                  <CardContent className="space-y-2 p-4 text-sm">
                    <p className="font-medium">Stand {row.standNumber} · {row.fullName}</p>
                    <p>{AGREEMENT_STATUS_LABEL[row.status]}</p>
                    <p>{row.executionMethod === "in_person" ? "In person" : row.executionMethod === "courier" ? "Courier" : "—"}</p>
                    {row.followUp?.due ? <Badge variant="destructive">{row.followUp.overdueDays}d past {row.followUp.limitDays}d</Badge> : row.followUp ? <p>{row.followUp.limitDays} day watch</p> : null}
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>Update</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="hidden md:block">
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stand</TableHead>
                      <TableHead>Purchaser</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Follow-up</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAgreements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>No agreements match these filters.</TableCell>
                      </TableRow>
                    )}
                    {visibleAgreements.map((row) => (
                      <TableRow key={row.applicationId}>
                        <TableCell>{row.standNumber}</TableCell>
                        <TableCell>{row.fullName}</TableCell>
                        <TableCell>{AGREEMENT_STATUS_LABEL[row.status]}</TableCell>
                        <TableCell>{row.executionMethod === "in_person" ? "In person" : row.executionMethod === "courier" ? "Courier" : "—"}</TableCell>
                        <TableCell>
                          {row.followUp?.due ? <Badge variant="destructive">{row.followUp.overdueDays}d past {row.followUp.limitDays}d</Badge> : row.followUp ? `${row.followUp.limitDays} day watch` : "—"}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setSelected(row)}>Update</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stand {selected?.standNumber}</DialogTitle>
              <DialogDescription>{selected ? `${selected.fullName} · ${AGREEMENT_STATUS_LABEL[selected.status]}` : ""}</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                {selected.executionMethod === "courier" && <p className="text-sm">{agreementReturnLine()}</p>}
                {selected.domiciliumAddress && <p className="text-sm">Notices: {selected.domiciliumAddress}</p>}
                {selected.dispatchTracking && <p className="text-sm">Outbound tracking: {selected.dispatchTracking}</p>}
                {selected.returnTracking && <p className="text-sm">Return tracking: {selected.returnTracking} via {selected.returnCourier}</p>}
                {selected.witnesses.length > 0 && (
                  <ul className="text-sm">
                    {selected.witnesses.map((witness) => <li key={witness.name}>{witness.name}</li>)}
                  </ul>
                )}
                {selected.status === "acknowledged" && selected.executionMethod === "courier" && (
                  <div className="space-y-2">
                    <Label htmlFor="dispatch-tracking">Outbound tracking</Label>
                    <Input id="dispatch-tracking" value={tracking} onChange={(event) => setTracking(event.target.value)} />
                    <Button disabled={busy} onClick={() => void runStaff(() => standSalesApi.staffMarkDispatched(selected.applicationId, tracking))}>Mark dispatched</Button>
                  </div>
                )}
                {canReceive(selected) && (
                  <Button disabled={busy} onClick={() => void runStaff(() => standSalesApi.staffMarkOriginalReceived(selected.applicationId))}>Mark original received</Button>
                )}
                {selected.status === "original_received" && (
                  <Button disabled={busy} onClick={() => void runStaff(() => standSalesApi.staffMarkCountersigned(selected.applicationId))}>Mark countersigned</Button>
                )}
                {selected.status !== "countersigned" && (
                  <div className="space-y-2">
                    <Label htmlFor="action-note">Note for the buyer</Label>
                    <Input id="action-note" value={note} onChange={(event) => setNote(event.target.value)} />
                    <Button variant="outline" disabled={busy} onClick={() => void runStaff(() => standSalesApi.staffMarkActionRequired(selected.applicationId, note))}>Mark action required</Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function canReceive(row: AgreementStaffRow) {
  if (row.status === "countersigned" || row.status === "original_received" || row.status === "pending_review") return false;
  if (row.executionMethod === "in_person") return row.status === "acknowledged" || row.status === "action_required";
  if (row.executionMethod === "courier") return row.status === "dispatched" || row.status === "return_submitted" || (row.status === "action_required" && Boolean(row.dispatchedAt));
  return false;
}
