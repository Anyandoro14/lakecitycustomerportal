import { Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IdReviewBadge, PortalBadge } from "@/components/StatusBadges";
import { StaffGate } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backend, type Lead, type LeadStage, type Stand } from "@/lib/backend";
import { maskIdNumber } from "@shared/domain/id-validation.ts";

export default function Dashboard() {
  return <StaffGate>{(staff) => <DashboardView staffEmail={staff.email} />}</StaffGate>;
}

function DashboardView({ staffEmail }: { staffEmail: string }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([backend.listLeads(), backend.listStands()]);
      setLeads(l);
      setStands(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const counts = {
    total: stands.length,
    available: stands.filter((s) => s.status === "available").length,
    paid: stands.filter((s) => s.status === "paid").length,
    signed: stands.filter((s) => s.status === "signed").length,
  };
  const pending = (leads ?? []).filter((l) => l.idReviewStatus === "id_pending_review");
  const byStage = (stage: LeadStage) => (leads ?? []).filter((l) => l.stage === stage);

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Stand sales: internal</h1>
          <p className="text-sm text-muted-foreground">Signed in as {staffEmail}</p>
        </div>
        {backend.resetDemo && (
          <Button variant="outline" size="sm" onClick={async () => { await backend.resetDemo!(); await load(); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reset demo data
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Remaining (available)", counts.available, "text-primary"],
          ["Paid (reserved)", counts.paid, "text-amber-700"],
          ["Signed (allocated)", counts.signed, "text-emerald-700"],
          ["Total stands", counts.total, "text-foreground"],
        ].map(([label, value, cls]) => (
          <Card key={label as string}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className={`mt-2 font-serif text-3xl font-semibold ${cls}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={pending.length ? "border-amber-300" : undefined}>
        <CardHeader>
          <CardTitle className="text-lg">ID review queue ({pending.length})</CardTitle>
          <CardDescription>Customers can't pay until their ID (and every co-owner's ID) is approved.</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>
          ) : (
            <LeadTable leads={pending} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lead lists</CardTitle>
        </CardHeader>
        <CardContent>
          {!leads ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Tabs defaultValue="form_filled">
              <TabsList>
                <TabsTrigger value="form_filled">Form filled ({byStage("form_filled").length})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({byStage("paid").length})</TabsTrigger>
                <TabsTrigger value="signed">Signed ({byStage("signed").length})</TabsTrigger>
              </TabsList>
              {(["form_filled", "paid", "signed"] as const).map((s) => (
                <TabsContent key={s} value={s}>
                  {byStage(s).length ? <LeadTable leads={byStage(s)} /> : <p className="py-6 text-sm text-muted-foreground">No leads in this list yet.</p>}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LeadTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Buyer</TableHead>
            <TableHead>Stand</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Portal</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <p className="font-medium">{l.buyer.fullName}</p>
                <p className="text-xs text-muted-foreground">{l.buyer.email}{l.coOwners.length ? ` · +${l.coOwners.length} co-owner(s)` : ""}</p>
              </TableCell>
              <TableCell>{l.standNumber}</TableCell>
              <TableCell className="font-mono text-xs">{maskIdNumber(l.buyer.idNumber)}</TableCell>
              <TableCell><IdReviewBadge status={l.idReviewStatus} /></TableCell>
              <TableCell><PortalBadge status={l.portalStatus} /></TableCell>
              <TableCell className="whitespace-nowrap text-xs">{l.createdAt.slice(0, 16).replace("T", " ")}</TableCell>
              <TableCell>
                <Button asChild size="sm" variant="outline"><Link to={`/internal/leads/${l.id}`}>Open</Link></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
