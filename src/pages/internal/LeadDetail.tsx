import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { PortalBadge, ReportStatusBadge } from "@/components/StatusBadges";
import { StaffGate } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type PersonIdentity } from "@/lib/backend";
import { downloadPdf } from "@/lib/pdf/builder";
import { offerPdf, paymentSchedulePdf } from "@/lib/pdf/documents";
import { PRICE_VAT_NOTE, quoteForSize } from "@shared/domain/campaign.ts";
import { countryName } from "@shared/domain/countries.ts";
import { ID_TYPE_LABELS, validateIdentity } from "@shared/domain/id-validation.ts";
import { formatUsd } from "@shared/domain/schedule.ts";

export default function LeadDetail() {
  return <StaffGate>{() => <LeadDetailView />}</StaffGate>;
}

const ts = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") : null);

function LeadDetailView() {
  const { leadId } = useParams();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);

  const load = useCallback(async () => {
    const all = await backend.listLeads();
    setLead(all.find((l) => l.id === leadId) ?? null);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (lead === undefined) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!lead) return <div className="container py-16 text-muted-foreground">Lead not found.</div>;

  return (
    <div className="container max-w-5xl space-y-6 py-10">
      <Link to="/internal" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> All leads
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-semibold">{lead.contact.fullName}</h1>
        <ReportStatusBadge lead={lead} />
        <PortalBadge status={lead.portalStatus} />
      </div>
      <p className="text-sm text-muted-foreground">
        Stand {lead.standNumber} · Ref {lead.id.slice(0, 8).toUpperCase()} · {lead.contact.email} · {lead.contact.phone} · Created {ts(lead.createdAt)}
      </p>

      <OfferCard lead={lead} onChange={load} />
      <ProgressCard lead={lead} />
    </div>
  );
}

function PersonIdPanel({ person, title }: { person: PersonIdentity; title: string }) {
  const check = validateIdentity({ idType: person.idType, issuingCountry: person.idIssuingCountry, idNumber: person.idNumber, expiryDate: person.idExpiry });
  return (
    <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-3">
      <p className="font-semibold sm:col-span-3">{title}</p>
      <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="font-medium">{person.fullName}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Date of birth</dt><dd>{person.dateOfBirth}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Contact</dt><dd className="break-all">{person.email} · {person.phone}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Document</dt><dd>{ID_TYPE_LABELS[person.idType]} · {countryName(person.idIssuingCountry)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">ID number</dt><dd className="font-mono">{person.idNumber}</dd></div>
      <div>
        <dt className="text-xs text-muted-foreground">Automated format check</dt>
        <dd className={check.ok ? "text-emerald-700" : "text-destructive"}>{check.ok ? "Passed" : "Failed"} · {check.rule}</dd>
      </div>
    </dl>
  );
}

function OfferCard({ lead, onChange }: { lead: Lead; onChange: () => Promise<void> }) {
  const { stand } = useStand(lead.standNumber);
  const [official, setOfficial] = useState({
    standConfirmed: lead.officialUse?.standConfirmed ?? false,
    checkedBy: lead.officialUse?.checkedBy ?? "",
    signature: lead.officialUse?.signature ?? "",
    date: lead.officialUse?.date ?? new Date().toISOString().slice(0, 10),
  });

  if (!lead.offer) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Offer form</CardTitle><CardDescription>Not submitted yet.</CardDescription></CardHeader>
      </Card>
    );
  }
  const o = lead.offer;
  const q = stand?.sizeSqm ? quoteForSize(stand.sizeSqm) : null;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Offer form</CardTitle>
          <CardDescription>Signed at {o.signedAtPlace} on {o.signedDate} by {o.purchaserName} ({o.signatureType})</CardDescription>
        </div>
        {stand && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => downloadPdf(await offerPdf(lead, stand), `offer-${lead.standNumber}.pdf`)}>
              <Download className="mr-1.5 h-4 w-4" /> Offer PDF
            </Button>
            <Button size="sm" variant="outline" onClick={async () => downloadPdf(await paymentSchedulePdf(lead, stand), `schedule-${lead.standNumber}.pdf`)}>
              <Download className="mr-1.5 h-4 w-4" /> Schedule PDF
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {q && (
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Size</dt><dd>{q.sizeSqm.toLocaleString("en-US")} m²{stand?.phase ? ` · Phase ${stand.phase}` : ""}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Price</dt><dd>{formatUsd(q.priceCents)} {PRICE_VAT_NOTE}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Due at start</dt><dd>{formatUsd(q.dueNowCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Monthly</dt><dd>{formatUsd(q.monthlyCents)} × {q.termMonths}</dd></div>
          </dl>
        )}
        <PersonIdPanel person={o.buyer} title="Purchaser" />
        {o.coOwners.map((c) => <PersonIdPanel key={c.position} person={c} title={`Co-owner ${c.position}`} />)}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Residential address</dt><dd>{o.buyer.physicalAddress}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Next of kin</dt><dd>{o.nextOfKin.fullName} · {o.nextOfKin.cellPhone}</dd></div>
        </dl>

        <div className="rounded-lg border-2 border-dashed p-4">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide">For official use only</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={official.standConfirmed} onCheckedChange={(v) => setOfficial({ ...official, standConfirmed: !!v })} />
              Stand {lead.standNumber} confirmed
            </label>
            <Field id="checked-by" label="Checked by">
              <Input id="checked-by" value={official.checkedBy} onChange={(e) => setOfficial({ ...official, checkedBy: e.target.value })} />
            </Field>
            <Field id="official-date" label="Date">
              <Input id="official-date" type="date" value={official.date} onChange={(e) => setOfficial({ ...official, date: e.target.value })} />
            </Field>
            <Field id="official-signature" label="Signature (typed)" className="sm:col-span-2">
              <Input id="official-signature" className="font-serif italic" value={official.signature} onChange={(e) => setOfficial({ ...official, signature: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              onClick={async () => {
                await backend.setOfficialUse(lead.id, official);
                toast.success("Official-use block saved");
                await onChange();
              }}
            >
              Save
            </Button>
            {lead.officialUse && <span className="text-xs text-muted-foreground">Last saved by {lead.officialUse.updatedBy} at {ts(lead.officialUse.updatedAt)}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressCard({ lead }: { lead: Lead }) {
  const r = lead.portalRecords;
  const rows: [string, string | null][] = [
    ["Offer submitted", ts(lead.offer?.submittedAt)],
    ["Payment confirmed", lead.paidAt && `${ts(lead.paidAt)} · ${lead.paymentReference} · ${lead.paymentAmountCents ? formatUsd(lead.paymentAmountCents) : ""}`],
    ["Collection schedule (mock)", r?.collectionSchedule.accountId ?? null],
    ["Master schedule row (mock)", r?.masterSchedule.rowId ?? null],
    ["Odoo customer / account (mock)", r ? `${r.odoo.partner.ref} / ${r.odoo.account.ref}` : null],
    ["Agreement of Sale (parked, OI-TBC-13)", lead.signedAt],
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Progress</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 border-b py-1.5 last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
