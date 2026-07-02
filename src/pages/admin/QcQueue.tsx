import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// payment_receipts is not yet in generated Supabase types.
const supabase = supabaseTyped as any;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Eye, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/** Review manually submitted receipts; approval triggers Odoo BNPL sync for Odoo tenants. */

interface PaymentReceipt {
  id: string;
  stand_number: string;
  amount: number;
  payment_date: string;
  gateway: string;
  gateway_reference: string | null;
  receipt_file_url: string | null;
  qc_status: string;
  qc_notes: string | null;
  created_at: string;
}

const QcQueue = () => {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [qcNotes, setQcNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const loadReceipts = async (tid: string) => {
    const { data, error } = await supabase
      .from("payment_receipts")
      .select(
        "id, stand_number, amount, payment_date, gateway, gateway_reference, receipt_file_url, qc_status, qc_notes, created_at",
      )
      .eq("tenant_id", tid)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      toast.error(error.message);
      return;
    }
    setReceipts((data || []) as PaymentReceipt[]);
  };

  const checkAccessAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/internal-login");
      return;
    }

    const { data: internalUser, error: iuErr } = await supabase
      .from("internal_users")
      .select("id, role, tenant_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (iuErr || !internalUser) {
      navigate("/internal-login");
      return;
    }

    const allowedRoles = ["admin", "super_admin", "director"];
    if (!allowedRoles.includes(internalUser.role)) {
      toast.error("You do not have access to the QC Queue");
      navigate("/internal-portal");
      return;
    }

    setInternalUserId(internalUser.id);
    setTenantId(internalUser.tenant_id);

    await loadReceipts(internalUser.tenant_id);
    setLoading(false);
  };

  const handleAction = async () => {
    if (!selectedReceipt || !actionType || !internalUserId || !tenantId) return;
    setProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired");
        return;
      }

      const qc_status = actionType === "approve" ? "approved" : "rejected";
      const { error: updErr } = await supabase
        .from("payment_receipts")
        .update({
          qc_status,
          qc_notes: qcNotes.trim() || null,
          qc_reviewed_at: new Date().toISOString(),
          qc_reviewer_id: internalUserId,
        })
        .eq("id", selectedReceipt.id)
        .eq("tenant_id", tenantId);

      if (updErr) {
        toast.error(updErr.message);
        return;
      }

      if (actionType === "approve") {
        const base = import.meta.env.VITE_SUPABASE_URL;
        const syncRes = await fetch(`${base}/functions/v1/odoo-sync-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ receipt_id: selectedReceipt.id }),
        });
        const syncJson = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok && syncJson?.status !== "skipped") {
          toast.error(
            typeof syncJson?.error === "string" ? syncJson.error : "Accounting sync failed — receipt is still approved.",
          );
        } else if (syncJson?.status === "skipped") {
          toast.info(syncJson?.reason || "Skipped Odoo (non-Odoo tenant or receipt already recorded in Odoo).");
        } else {
          toast.success("Receipt approved and posted to the BNPL ledger.");
        }
      } else {
        toast.success("Receipt rejected.");
      }

      await loadReceipts(tenantId);
    } finally {
      setSelectedReceipt(null);
      setActionType(null);
      setQcNotes("");
      setProcessing(false);
    }
  };

  // Stats for chart
  const statusCounts = receipts.reduce((acc, r) => {
    acc[r.qc_status] = (acc[r.qc_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(statusCounts).map(([status, count]) => ({
    status: status.replace('_', ' '),
    count,
  }));

  const pendingReceipts = receipts.filter(r => r.qc_status === 'pending_qc');
  const recentReviewed = receipts.filter(r => r.qc_status !== 'pending_qc').slice(0, 20);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Payment QC Queue</h1>
            <p className="text-muted-foreground">
              Review and approve payment receipts ({pendingReceipts.length} pending)
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => tenantId && loadReceipts(tenantId)}
            disabled={!tenantId}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Stats Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pending Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Review ({pendingReceipts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingReceipts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No receipts pending review</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stand</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReceipts.map(receipt => (
                    <TableRow key={receipt.id}>
                      <TableCell className="font-medium">{receipt.stand_number}</TableCell>
                      <TableCell>${receipt.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{format(parseISO(receipt.payment_date), "d MMM yyyy")}</TableCell>
                      <TableCell><Badge variant="outline">{receipt.gateway}</Badge></TableCell>
                      <TableCell className="text-sm">{receipt.gateway_reference || '—'}</TableCell>
                      <TableCell>
                        {receipt.receipt_file_url ? (
                          <a href={receipt.receipt_file_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4 text-blue-500" />
                          </a>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => { setSelectedReceipt(receipt); setActionType('approve'); }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setSelectedReceipt(receipt); setActionType('reject'); }}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recently Reviewed */}
        <Card>
          <CardHeader>
            <CardTitle>Recently Reviewed</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stand</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReviewed.map(receipt => (
                  <TableRow key={receipt.id}>
                    <TableCell>{receipt.stand_number}</TableCell>
                    <TableCell>${receipt.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{format(parseISO(receipt.payment_date), "d MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={receipt.qc_status === 'approved' ? 'default' : 'destructive'}>
                        {receipt.qc_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{receipt.qc_notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Approve/Reject Dialog */}
      <AlertDialog open={!!selectedReceipt && !!actionType} onOpenChange={() => { setSelectedReceipt(null); setActionType(null); setQcNotes(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} Receipt
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stand: {selectedReceipt?.stand_number} — ${selectedReceipt?.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <br />
              Date: {selectedReceipt?.payment_date}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="QC notes (optional)"
            value={qcNotes}
            onChange={(e) => setQcNotes(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {actionType === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QcQueue;
