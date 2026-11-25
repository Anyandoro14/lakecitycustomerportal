import { ArrowRight, CheckCircle2, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CountrySelect, Field } from "@/components/form";
import { PersonFields, draftToIdentity, emptyPerson, type PersonDraft, type PersonErrors } from "@/components/PersonFields";
import { PlaceholderTag } from "@/components/Placeholder";
import { SignaturePad } from "@/components/SignaturePad";
import { StandLayout } from "@/components/StandLayout";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type NextOfKin, type OfferSubmission, type Stand } from "@/lib/backend";
import { offerPdf } from "@/lib/pdf/documents";
import { CAMPAIGN } from "@shared/domain/campaign.ts";
import { MAX_CO_OWNERS } from "@shared/domain/types.ts";
import { offerAcknowledgements, validateOfferForm, type OfferFormErrors } from "@shared/domain/offer-form.ts";

export default function OfferStep() {
  return (
    <WizardShell step="offer" wide>
      {({ lead }) => <OfferPane lead={lead} />}
    </WizardShell>
  );
}

function OfferPane({ lead }: { lead: Lead }) {
  const { stand, band, loading } = useStand(lead.standNumber);
  if (loading || !stand) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-label="Loading" />;
  return (
    <StandLayout stand={stand} band={band}>
      {lead.offer ? <SubmittedOffer lead={lead} stand={stand} /> : <OfferFormEditor lead={lead} />}
    </StandLayout>
  );
}

function SubmittedOffer({ lead, stand }: { lead: Lead; stand: Stand }) {
  const navigate = useNavigate();
  const o = lead.offer!;
  const paid = lead.stage !== "form_filled";

  async function download() {
    const bytes = await offerPdf(lead, stand);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lakecity-offer-stand-${stand.standNumber}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h2 className="font-serif text-2xl font-semibold">Your offer for stand {lead.standNumber}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed by {o.purchaserName} at {o.signedAtPlace} on {o.signedDate}.
          </p>
        </div>
      </div>
      <dl className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Purchaser{o.coOwners.length ? "s" : ""}</dt>
          <dd className="font-medium">{[o.buyer.fullName, ...o.coOwners.map((c) => c.fullName)].join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Term</dt>
          <dd className="font-medium">{o.termMonths} months</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Next of kin</dt>
          <dd className="font-medium">{o.nextOfKin.fullName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-medium">{paid ? "Paid - stand reserved" : "Awaiting payment"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate(`/apply/${lead.id}/${paid ? "portal" : "payment"}`)}>
          {paid ? "Go to your portal account" : "Continue to payment"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => void download()}>
          <Download className="mr-2 h-4 w-4" /> Download offer (PDF)
        </Button>
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function errorsFor(errors: OfferFormErrors, prefix: string): PersonErrors {
  const out: PersonErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1) as keyof PersonDraft] = v;
  }
  return out;
}

interface BuyerExtras {
  physicalAddress: string;
  postalAddress: string;
  country: string;
}

function OfferFormEditor({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  const [buyer, setBuyer] = useState<PersonDraft>(emptyPerson({ fullName: lead.contact.fullName, email: lead.contact.email, phone: lead.contact.phone }));
  const [extras, setExtras] = useState<BuyerExtras>({ physicalAddress: "", postalAddress: "", country: "" });
  const [coOwners, setCoOwners] = useState<PersonDraft[]>([]);
  const [rest, setRest] = useState({
    businessPhone: "",
    alternativeAddress: "",
    nextOfKin: { fullName: "", dateOfBirth: "", idNumber: "", residentialAddress: "", cellPhone: "", businessPhone: "", email: "", alternativeAddress: "" } as NextOfKin,
    acknowledgements: {} as Record<string, boolean>,
    signedAtPlace: "",
    signedDate: today(),
    signatureType: "typed" as "typed" | "drawn",
    signatureValue: "",
    purchaserName: lead.contact.fullName,
  });
  const [errors, setErrors] = useState<OfferFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const setNok = (patch: Partial<NextOfKin>) => setRest((r) => ({ ...r, nextOfKin: { ...r.nextOfKin, ...patch } }));

  function build(): OfferSubmission {
    return {
      buyer: { ...draftToIdentity(buyer), ...extras },
      coOwners: coOwners.map((c, i) => ({ ...draftToIdentity(c), position: i + 1 })),
      termMonths: CAMPAIGN.termMonths,
      ...rest,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const offer = build();
    const errs = validateOfferForm(offer);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please complete the highlighted fields.");
      requestAnimationFrame(() => document.querySelector(".text-destructive")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setSubmitting(true);
    try {
      await backend.submitOffer(lead.id, offer);
      navigate(`/apply/${lead.id}/payment`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your offer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Offer to purchase</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Based on LakeCity's General Offer Form (September 2025). <PlaceholderTag />
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="font-semibold">Purchaser (I/We)</h3>
        <PersonFields prefix="buyer" value={buyer} errors={errorsFor(errors, "buyer")} onChange={(p) => setBuyer((b) => ({ ...b, ...p }))} lockContact />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="physicalAddress" label="Residential address" error={errors["buyer.physicalAddress"]} className="sm:col-span-2">
            <Textarea id="physicalAddress" rows={2} autoComplete="street-address" value={extras.physicalAddress} onChange={(e) => setExtras({ ...extras, physicalAddress: e.target.value })} />
          </Field>
          <Field id="postalAddress" label="Postal address" error={errors["buyer.postalAddress"]} className="sm:col-span-2">
            <Textarea id="postalAddress" rows={2} value={extras.postalAddress} onChange={(e) => setExtras({ ...extras, postalAddress: e.target.value })} />
          </Field>
          <Field id="country" label="Country of residence" error={errors["buyer.country"]}>
            <CountrySelect id="country" value={extras.country} invalid={!!errors["buyer.country"]} onChange={(e) => setExtras({ ...extras, country: e.target.value })} />
          </Field>
          <Field id="businessPhone" label="Business phone" optional>
            <Input id="businessPhone" type="tel" value={rest.businessPhone} onChange={(e) => setRest({ ...rest, businessPhone: e.target.value })} />
          </Field>
          <Field id="alternativeAddress" label="Alternative residential address" optional className="sm:col-span-2">
            <Textarea id="alternativeAddress" rows={2} value={rest.alternativeAddress} onChange={(e) => setRest({ ...rest, alternativeAddress: e.target.value })} />
          </Field>
        </div>
      </section>

      <Separator />
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Co-owners</h3>
          {coOwners.length < MAX_CO_OWNERS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setCoOwners((c) => [...c, emptyPerson()])}>
              <Plus className="mr-1 h-4 w-4" /> Add co-owner
            </Button>
          )}
        </div>
        {coOwners.length === 0 && <p className="text-sm text-muted-foreground">Optional. Add up to {MAX_CO_OWNERS} people buying the stand with you.</p>}
        {coOwners.map((c, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Co-owner {i + 1}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCoOwners((list) => list.filter((_, j) => j !== i))}>
                <Trash2 className="mr-1 h-4 w-4" /> Remove
              </Button>
            </div>
            <PersonFields
              prefix={`coOwner${i + 1}`}
              value={c}
              errors={errorsFor(errors, `coOwner${i + 1}`)}
              onChange={(p) => setCoOwners((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)))}
            />
          </div>
        ))}
      </section>

      <Separator />
      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Next of kin</h3>
        <Field id="nok-name" label="Full name" error={errors["nextOfKin.fullName"]} className="sm:col-span-2">
          <Input id="nok-name" value={rest.nextOfKin.fullName} onChange={(e) => setNok({ fullName: e.target.value })} />
        </Field>
        <Field id="nok-dob" label="D.O.B." error={errors["nextOfKin.dateOfBirth"]}>
          <Input id="nok-dob" type="date" value={rest.nextOfKin.dateOfBirth} onChange={(e) => setNok({ dateOfBirth: e.target.value })} />
        </Field>
        <Field id="nok-id" label="ID number" error={errors["nextOfKin.idNumber"]}>
          <Input id="nok-id" value={rest.nextOfKin.idNumber} onChange={(e) => setNok({ idNumber: e.target.value })} />
        </Field>
        <Field id="nok-address" label="Residential address" error={errors["nextOfKin.residentialAddress"]} className="sm:col-span-2">
          <Textarea id="nok-address" rows={2} value={rest.nextOfKin.residentialAddress} onChange={(e) => setNok({ residentialAddress: e.target.value })} />
        </Field>
        <Field id="nok-cell" label="Cell number" error={errors["nextOfKin.cellPhone"]}>
          <Input id="nok-cell" type="tel" value={rest.nextOfKin.cellPhone} onChange={(e) => setNok({ cellPhone: e.target.value })} />
        </Field>
        <Field id="nok-business" label="Business phone" optional>
          <Input id="nok-business" type="tel" value={rest.nextOfKin.businessPhone} onChange={(e) => setNok({ businessPhone: e.target.value })} />
        </Field>
        <Field id="nok-email" label="Email" optional error={errors["nextOfKin.email"]}>
          <Input id="nok-email" type="email" value={rest.nextOfKin.email} onChange={(e) => setNok({ email: e.target.value })} />
        </Field>
        <Field id="nok-alt" label="Alternative / postal address" optional className="sm:col-span-2">
          <Textarea id="nok-alt" rows={2} value={rest.nextOfKin.alternativeAddress} onChange={(e) => setNok({ alternativeAddress: e.target.value })} />
        </Field>
      </section>

      <Separator />
      <section className="space-y-3">
        <h3 className="font-semibold">
          Conditions <PlaceholderTag>PLACEHOLDER wording</PlaceholderTag>
        </h3>
        {offerAcknowledgements(CAMPAIGN.termMonths).map((a) => (
          <div key={a.key}>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={!!rest.acknowledgements[a.key]}
                onCheckedChange={(v) => setRest({ ...rest, acknowledgements: { ...rest.acknowledgements, [a.key]: !!v } })}
                className="mt-0.5"
                aria-invalid={!!errors[`ack.${a.key}`]}
              />
              <span>{a.text}</span>
            </label>
            {errors[`ack.${a.key}`] && <p className="ml-7 text-xs font-medium text-destructive">{errors[`ack.${a.key}`]}</p>}
          </div>
        ))}
      </section>

      <Separator />
      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Signature</h3>
        <Field id="signedAt" label="Signed at (place)" error={errors.signedAtPlace}>
          <Input id="signedAt" placeholder="e.g. Harare" value={rest.signedAtPlace} onChange={(e) => setRest({ ...rest, signedAtPlace: e.target.value })} />
        </Field>
        <Field id="signedDate" label="Date" error={errors.signedDate}>
          <Input id="signedDate" type="date" value={rest.signedDate} onChange={(e) => setRest({ ...rest, signedDate: e.target.value })} />
        </Field>
        <Field id="purchaserName" label="Purchaser name" error={errors.purchaserName} className="sm:col-span-2">
          <Input id="purchaserName" value={rest.purchaserName} onChange={(e) => setRest({ ...rest, purchaserName: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Tabs value={rest.signatureType} onValueChange={(v) => setRest({ ...rest, signatureType: v as "typed" | "drawn", signatureValue: "" })}>
            <TabsList>
              <TabsTrigger value="typed">Type signature</TabsTrigger>
              <TabsTrigger value="drawn">Draw signature</TabsTrigger>
            </TabsList>
            <TabsContent value="typed">
              <Input
                aria-label="Typed signature"
                placeholder="Type your full name"
                className="font-serif text-xl italic"
                value={rest.signatureValue}
                onChange={(e) => setRest({ ...rest, signatureValue: e.target.value })}
              />
            </TabsContent>
            <TabsContent value="drawn">
              <SignaturePad invalid={!!errors.signatureValue} onChange={(v) => setRest((r) => ({ ...r, signatureValue: v }))} />
            </TabsContent>
          </Tabs>
          {errors.signatureValue && <p className="mt-1 text-xs font-medium text-destructive">{errors.signatureValue}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            This signs your offer to purchase. LakeCity will arrange the Agreement of Sale with you separately. <PlaceholderTag>TBC</PlaceholderTag>
          </p>
        </div>
      </section>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit offer and continue to payment
      </Button>
    </form>
  );
}
