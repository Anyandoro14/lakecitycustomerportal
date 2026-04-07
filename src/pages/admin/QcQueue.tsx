import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

/**
 * QC Queue — placeholder UI.
 *
 * The `payment_receipts` table is not yet deployed, so all Supabase queries
 * are stubbed out. Once the table is created via migration, restore the
 * original queries.
 */

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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [qcNotes, setQcNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const checkAccessAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/internal-login");
      return;
    }

    const { data: internalUser } = await supabase
      .from('internal_users')
      .select('role')
      .eq('user_id', session.user.id)
      .single();

    if (!internalUser) {
      navigate("/internal-login");
      return;
    }

    const allowedRoles = ['admin', 'super_admin', 'director'];
    if (!allowedRoles.includes(internalUser.role)) {
      toast.error("You do not have access to the QC Queue");
      navigate("/internal-portal");
      return;
    }

    setUserRole(internalUser.role);
    // payment_receipts table not yet deployed — load empty
    setReceipts([]);
    setLoading(false);
  };

  const loadReceipts = async () => {
    // Stub: payment_receipts table not yet in schema
    toast.info("QC Queue will be available once the payment receipts table is deployed.");
    setReceipts([]);
  };

  const handleAction = async () => {
    if (!selectedReceipt || !actionType) return;
    setProcessing(true);
    toast.info("QC actions will be available once the payment receipts table is deployed.");
    setSelectedReceipt(null);
    setActionType(null);
    setQcNotes("");
    setProcessing(false);
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
          <Button variant="outline" onClick={loadReceipts}>
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
                      <TableCell>{new Date(receipt.payment_date).toLocaleDateString()}</TableCell>
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
                    <TableCell>{new Date(receipt.payment_date).toLocaleDateString()}</TableCell>
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
