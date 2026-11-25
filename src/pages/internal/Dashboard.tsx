import { Download, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PortalBadge, ReportStatusBadge } from "@/components/StatusBadges";
import { StaffGate } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backend, type Lead, type Stand } from "@/lib/backend";
import { REPORT_STATUSES, reportCounts, reportCsv, reportStatus, type ReportStatus } from "@shared/domain/report.ts";

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

  const stock = {
    total: stands.length,
    available: stands.filter((x) => x.status === "available").length,
  };
  const counts = reportCounts(leads ?? []);
  const byStatus = (status: ReportStatus) => (leads ?? []).filter((l) => reportStatus(l) === status);
  const tones: Record<ReportStatus, string> = { signed_up: "text-foreground", signed_up_paid: "text-amber-700", signed_up_paid_signed: "text-primary" };

  function exportCsv() {
    const blob = new Blob([reportCsv(leads ?? [], stands)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lakecity-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        {REPORT_STATUSES.map((r) => (
          <Card key={r.key} data-testid={`count-${r.key}`}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</p>
              <p className={`mt-2 font-serif text-3xl font-semibold ${tones[r.key]}`}>{counts[r.key]}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.meaning}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Stands available</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-primary">{stock.available} <span className="text-base text-muted-foreground">/ {stock.total}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">A stand leaves inventory when its payment is confirmed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Sales report</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              One status per lead. Buyers who pay but don't sign stay "Signed up and Paid" and are still enrolled in the portal and Odoo.
              {counts.notInReport > 0 && ` ${counts.notInReport} application(s) without a submitted offer are not in the report.`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!leads}>
            <Download className="mr-1.5 h-4 w-4" /> Export report (CSV)
          </Button>
        </CardHeader>
        <CardContent>
          {!leads ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Tabs defaultValue="signed_up">
              <TabsList className="h-auto flex-wrap">
                {REPORT_STATUSES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key}>{r.label} ({counts[r.key]})</TabsTrigger>
                ))}
              </TabsList>
              {REPORT_STATUSES.map((r) => (
                <TabsContent key={r.key} value={r.key}>
                  {byStatus(r.key).length ? <LeadTable leads={byStatus(r.key)} /> : <p className="py-6 text-sm text-muted-foreground">No leads with this status yet.</p>}
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
            <TableHead>Offer</TableHead>
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
                <p className="font-medium">{l.contact.fullName}</p>
                <p className="text-xs text-muted-foreground">{l.contact.email}{l.offer?.coOwners.length ? ` · +${l.offer.coOwners.length} co-owner(s)` : ""}</p>
              </TableCell>
              <TableCell>{l.standNumber}</TableCell>
              <TableCell>{l.offer ? "Submitted" : "Not yet"}</TableCell>
              <TableCell><ReportStatusBadge lead={l} /></TableCell>
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
