import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import InternalNav from "@/components/InternalNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { standSalesApi } from "@/lib/stand-sales/api";

interface QueueRow {
  reference: string;
  standNumber: string;
  status: string;
  cardStatus: number | null;
  createdAt: string;
  held: boolean;
  canDismiss: boolean;
}

export default function StandSalesDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function load() {
    const { data, error: queueError } = await supabase.functions.invoke("stand-sales", { body: { action: "staff-queue" } });
    if (queueError || data?.error) {
      setError(data?.error || queueError?.message || "Could not load the queue.");
      setRows([]);
      return;
    }
    setRows(data.rows ?? []);
    setError(null);
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
      await load();
    })();
  }, [navigate]);

  async function dismiss(reference: string) {
    setError(null);
    try {
      await standSalesApi.staffDismiss(reference);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss that attempt.");
    }
  }

  if (!ready) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Checking staff access" /></div>;

  return (
    <div className="min-h-screen bg-background" data-testid="stand-sales-staff">
      <InternalNav currentPage="stand-sales" />
      <main className="container space-y-6 py-8">
        <div>
          <h1 className="font-display text-3xl">Stand sales</h1>
          <p className="text-sm text-muted-foreground">Signed in as {email}. Dismiss releases a buyer blocked by a held payment. Approved payments stay.</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Card>
          <CardContent className="p-0">
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
      </main>
    </div>
  );
}
