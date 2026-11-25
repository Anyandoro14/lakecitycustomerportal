import { ArrowLeft, CheckCircle2, Download, FileText, ImageOff, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { IdReviewBadge, PortalBadge, StageBadge } from "@/components/StatusBadges";
import { StaffGate } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStand } from "@/hooks/useStand";
import { backend, type IdReviewLogEntry, type Lead, type PersonIdentity } from "@/lib/backend";
import { downloadPdf } from "@/lib/pdf/builder";
import { offerPdf, paymentSchedulePdf } from "@/lib/pdf/documents";
import { ScheduleTable } from "@/pages/ScheduleStep";
import { countryName } from "@shared/domain/countries.ts";
import { ID_TYPE_LABELS, validateIdentity } from "@shared/domain/id-validation.ts";

export default function LeadDetail() {
  return <StaffGate>{() => <LeadDetailView />}</StaffGate>;
}

function LeadDetailView() {
  const { leadId } = useParams();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  const [log, setLog] = useState<IdReviewLogEntry[]>([]);

  const load = useCallback(async () => {
    const all = await backend.listLeads();
    setLead(all.find((l) => l.id === leadId) ?? null);
    if (leadId) setLog(await backend.listReviewLog(leadId));
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
        <h1 className="font-serif text-3xl font-semibold">{lead.buyer.fullName}</h1>
        <StageBadge stage={lead.stage} />
        <IdReviewBadge status={lead.idReviewStatus} />
        <PortalBadge status={lead.portalStatus} />
      </div>
      <p className="text-sm text-muted-foreground">
        Stand {lead.standNumber} · Ref {lead.id.slice(0, 8).toUpperCase()} · Created {lead.createdAt.slice(0, 16).replace("T", " ")}
      </p>

      <IdReviewCard lead={lead} log={log} onChange={load} />
      <OfferCard lead={lead} onChange={load} />
      <ProgressCard lead={lead} />
    </div>
  );
}

function IdDocument({ path, label }: { path: string | null; label: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [isPdf, setIsPdf] = useState(false);
  useEffect(() => {
    if (!path) return setUrl(null);
    backend.getIdDocumentUrl(path).then(async (u) => {
      setUrl(u);
      if (u) {
        const r = await fetch(u, { method: "GET" }).catch(() => null);
        setIsPdf(r?.headers.get("content-type")?.includes("pdf") ?? false);
      }
    });
  }, [path]);
  if (!path) return null;
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      {url === undefined ? (
        <div className="grid h-40 place-items-center rounded-md border"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : url === null ? (
        <div className="grid h-40 place-items-center rounded-md border bg-muted text-center text-xs text-muted-foreground">
          <ImageOff className="mb-1 h-5 w-5" />Image unavailable (mock mode keeps images in memory only)
        </div>
      ) : isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center gap-2 rounded-md border text-sm underline">
          <FileText className="h-5 w-5" /> Open PDF
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} className="h-40 w-full rounded-md border object-contain bg-muted" />
        </a>
      )}
    </figure>
  );
}

function PersonIdPanel({ person, title }: { person: PersonIdentity; title: string }) {
  const check = validateIdentity({ idType: person.idType, issuingCountry: person.idIssuingCountry, idNumber: person.idNumber, expiryDate: person.idExpiry });
  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[1fr_1.3fr]">
      <dl className="space-y-2 text-sm">
        <p className="font-semibold">{title}</p>
        <div><dt className="text-xs text-muted-foreground">Name typed</dt><dd className="font-medium">{person.fullName}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Date of birth</dt><dd>{person.dateOfBirth}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Document</dt><dd>{ID_TYPE_LABELS[person.idType]} · {countryName(person.idIssuingCountry)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">ID number typed</dt><dd className="font-mono">{person.idNumber}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Expiry</dt><dd>{person.idExpiry ?? "None given"}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">Automated format check</dt>
          <dd className={check.ok ? "text-emerald-700" : "text-destructive"}>
            {check.ok ? "Passed" : "Failed"} · {check.rule}
          </dd>
        </div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <IdDocument path={person.idFrontPath} label={person.idType === "passport" ? "Passport data page" : "Front"} />
        <IdDocument path={person.idBackPath} label="Back" />
      </div>
    </div>
  );
}

function IdReviewCard({ lead, log, onChange }: { lead: Lead; log: IdReviewLogEntry[]; onChange: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const locked = lead.stage !== "form_filled";

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      await backend.reviewId(lead.id, decision, reason);
      setReason("");
      toast.success(decision === "approved" ? "ID approved" : "ID rejected");
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">ID review</CardTitle>
        <CardDescription>Compare the typed name and ID number with each photo. Approve only if every person matches.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PersonIdPanel person={lead.buyer} title="Buyer" />
        {lead.coOwners.map((c) => <PersonIdPanel key={c.id} person={c} title={`Co-owner ${c.position}`} />)}

        {!locked && (
          <div className="space-y-3 rounded-lg bg-muted/50 p-4">
            <Field id="review-reason" label="Reason / note" hint="Required when rejecting. Shown to the customer.">
              <Textarea id="review-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide("approved")} disabled={!!busy}>
                {busy === "approved" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Approve
              </Button>
              <Button variant="destructive" onClick={() => decide("rejected")} disabled={!!busy || !reason.trim()}>
                {busy === "rejected" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Reject
              </Button>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Review log</p>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {log.map((e) => (
                <li key={e.id}>
                  <span className="font-medium capitalize">{e.decision}</span> by {e.reviewer} at {e.createdAt.slice(0, 19).replace("T", " ")} UTC
                  {e.reason && <span className="text-muted-foreground">: "{e.reason}"</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OfferCard({ lead, onChange }: { lead: Lead; onChange: () => Promise<void> }) {
  const stand = useStand(lead.standNumber);
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
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Next of kin</dt><dd>{o.nextOfKin.fullName} · {o.nextOfKin.cellPhone}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Term</dt><dd>{o.termMonths} months</dd></div>
          <div><dt className="text-xs text-muted-foreground">Deposit</dt><dd>{o.depositInstalments === 3 ? "3 monthly payments" : "Single payment"}</dd></div>
        </dl>
        {stand && <ScheduleTable lead={lead} stand={stand} compact />}

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
            {lead.officialUse && (
              <span className="text-xs text-muted-foreground">Last saved by {lead.officialUse.updatedBy} at {lead.officialUse.updatedAt.slice(0, 16).replace("T", " ")}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressCard({ lead }: { lead: Lead }) {
  const rows: [string, string | null][] = [
    ["Schedule accepted", lead.scheduleAcceptedAt],
    ["Payment confirmed", lead.paidAt && `${lead.paidAt.slice(0, 16).replace("T", " ")} · ${lead.paymentReference}`],
    ["Collection schedule account", lead.collectionAccountId && `${lead.collectionAccountId} (created ${lead.collectionAccountCreatedAt?.slice(0, 10)})`],
    ["Portal account", lead.portalStatus === "not_created" ? null : `${lead.portalStatus} · created ${lead.portalCreatedAt?.slice(0, 16).replace("T", " ")}${lead.portalActivatedAt ? ` · activated ${lead.portalActivatedAt.slice(0, 16).replace("T", " ")}` : ""}`],
    ["DocuSign envelope", lead.envelopeId],
    ["Agreement signed", lead.signedAt],
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
