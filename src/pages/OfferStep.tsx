import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { PlaceholderTag } from "@/components/Placeholder";
import { SignaturePad } from "@/components/SignaturePad";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStand } from "@/hooks/useStand";
import { backend, type Lead, type NextOfKin, type OfferForm, type Stand } from "@/lib/backend";
import { CAMPAIGN, resolvePricing } from "@shared/domain/campaign.ts";
import { ID_TYPE_LABELS } from "@shared/domain/id-validation.ts";
import { offerAcknowledgements, validateOfferForm, type OfferFormErrors } from "@shared/domain/offer-form.ts";
import { computeSchedule, formatCents } from "@shared/domain/schedule.ts";
import { countryName } from "@shared/domain/countries.ts";

export default function OfferStep() {
  return (
    <WizardShell step="offer">
      {({ lead }) => <OfferFormView lead={lead} />}
    </WizardShell>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function OfferFormView({ lead }: { lead: Lead }) {
  const stand = useStand(lead.standNumber);
  if (!stand) {
    return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
  }
  if (lead.offer) {
    return <SubmittedOffer lead={lead} />;
  }
  return <OfferFormEditor lead={lead} stand={stand} />;
}

function SubmittedOffer({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Offer submitted</CardTitle>
        <CardDescription>Signed at {lead.offer!.signedAtPlace} on {lead.offer!.signedDate}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => navigate(`/apply/${lead.id}/schedule`)}>View payment schedule</Button>
      </CardContent>
    </Card>
  );
}

function OfferFormEditor({ lead, stand }: { lead: Lead; stand: Stand }) {
  const navigate = useNavigate();
  const pricing = resolvePricing(stand);
  const [form, setForm] = useState<Omit<OfferForm, "submittedAt">>({
    businessPhone: "",
    alternativeAddress: lead.buyer.postalAddress,
    nextOfKin: { fullName: "", dateOfBirth: "", idNumber: "", residentialAddress: "", cellPhone: "", businessPhone: "", email: "", alternativeAddress: "" },
    termMonths: CAMPAIGN.termMonths,
    depositInstalments: 1,
    acknowledgements: {},
    signedAtPlace: "",
    signedDate: today(),
    signatureType: "typed",
    signatureValue: "",
    purchaserName: lead.buyer.fullName,
  });
  const [errors, setErrors] = useState<OfferFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const schedule = useMemo(
    () =>
      computeSchedule({
        priceUsd: pricing.priceUsd,
        depositUsd: pricing.depositUsd,
        termMonths: form.termMonths,
        depositInstalments: form.depositInstalments,
        dueDay: CAMPAIGN.dueDay,
        startDate: today(),
      }),
    [pricing.priceUsd, pricing.depositUsd, form.termMonths, form.depositInstalments],
  );

  const setNok = (patch: Partial<NextOfKin>) => setForm((f) => ({ ...f, nextOfKin: { ...f.nextOfKin, ...patch } }));
  const purchasers = [lead.buyer, ...lead.coOwners];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateOfferForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please complete the highlighted fields.");
      requestAnimationFrame(() => document.querySelector(".text-destructive")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setSubmitting(true);
    try {
      await backend.submitOffer(lead.id, form);
      navigate(`/apply/${lead.id}/schedule`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your offer.");
    } finally {
      setSubmitting(false);
    }
  }

  const tag = pricing.isPlaceholder ? <PlaceholderTag>Demo figure · price TBC</PlaceholderTag> : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Offer to purchase</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Based on LakeCity's General Offer Form (September 2025). We've filled in what you already told us.{" "}
          <PlaceholderTag />
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Purchaser{purchasers.length > 1 ? "s" : ""} (I/We)</CardTitle>
          <CardDescription>From your application. Contact us if anything is wrong.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {purchasers.map((p, i) => (
            <dl key={i} className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-3">
              <ReadOnly label={i === 0 ? "Full name" : `Co-owner ${i} full name`} value={p.fullName} />
              <ReadOnly label="D.O.B." value={p.dateOfBirth} />
              <ReadOnly label="ID number" value={`${p.idNumber} (${ID_TYPE_LABELS[p.idType]}, ${countryName(p.idIssuingCountry)})`} />
              <ReadOnly label="Cell number" value={p.phone} />
              <ReadOnly label="Email" value={p.email} />
              {i === 0 && <ReadOnly label="Residential address" value={lead.buyer.physicalAddress} />}
            </dl>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="businessPhone" label="Business phone" optional>
              <Input id="businessPhone" type="tel" value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} />
            </Field>
            <Field id="alternativeAddress" label="Alternative residential / postal address" optional className="sm:col-span-2">
              <Textarea id="alternativeAddress" rows={2} value={form.alternativeAddress} onChange={(e) => setForm({ ...form, alternativeAddress: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Next of kin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="nok-name" label="Full name" error={errors["nextOfKin.fullName"]} className="sm:col-span-2">
            <Input id="nok-name" value={form.nextOfKin.fullName} onChange={(e) => setNok({ fullName: e.target.value })} />
          </Field>
          <Field id="nok-dob" label="D.O.B." error={errors["nextOfKin.dateOfBirth"]}>
            <Input id="nok-dob" type="date" value={form.nextOfKin.dateOfBirth} onChange={(e) => setNok({ dateOfBirth: e.target.value })} />
          </Field>
          <Field id="nok-id" label="ID number" error={errors["nextOfKin.idNumber"]}>
            <Input id="nok-id" value={form.nextOfKin.idNumber} onChange={(e) => setNok({ idNumber: e.target.value })} />
          </Field>
          <Field id="nok-address" label="Residential address" error={errors["nextOfKin.residentialAddress"]} className="sm:col-span-2">
            <Textarea id="nok-address" rows={2} value={form.nextOfKin.residentialAddress} onChange={(e) => setNok({ residentialAddress: e.target.value })} />
          </Field>
          <Field id="nok-cell" label="Cell number" error={errors["nextOfKin.cellPhone"]}>
            <Input id="nok-cell" type="tel" value={form.nextOfKin.cellPhone} onChange={(e) => setNok({ cellPhone: e.target.value })} />
          </Field>
          <Field id="nok-business" label="Business phone" optional>
            <Input id="nok-business" type="tel" value={form.nextOfKin.businessPhone} onChange={(e) => setNok({ businessPhone: e.target.value })} />
          </Field>
          <Field id="nok-email" label="Email" optional error={errors["nextOfKin.email"]}>
            <Input id="nok-email" type="email" value={form.nextOfKin.email} onChange={(e) => setNok({ email: e.target.value })} />
          </Field>
          <Field id="nok-alt" label="Alternative / postal address" optional className="sm:col-span-2">
            <Textarea id="nok-alt" rows={2} value={form.nextOfKin.alternativeAddress} onChange={(e) => setNok({ alternativeAddress: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Offer</CardTitle>
          <CardDescription>Prices are VAT inclusive ({CAMPAIGN.vatRatePercent}%).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <ReadOnly label="Stand number" value={stand.standNumber} />
            <ReadOnly label="Size" value={<>{pricing.sizeSqm ? `${pricing.sizeSqm} m²` : "TBC"} {tag}</>} />
            <ReadOnly label="Price (USD)" value={<>{formatCents(schedule.totalCents)} {tag}</>} />
            <ReadOnly label="Initial deposit (USD)" value={<>{formatCents(schedule.depositCents)} {tag}</>} />
            <ReadOnly label="Term in months" value={form.termMonths} />
            <ReadOnly label="Monthly payment (USD)" value={<>{formatCents(schedule.monthlyInstalmentCents)} {tag}</>} />
          </dl>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={form.depositInstalments === 3}
              onCheckedChange={(v) => setForm({ ...form, depositInstalments: v ? 3 : 1 })}
              className="mt-0.5"
            />
            <span>
              Pay the deposit in 3 monthly payments
              <span className="block text-xs text-muted-foreground">
                Monthly instalments start after the deposit is fully paid. <PlaceholderTag>TBC</PlaceholderTag>
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conditions</CardTitle>
          <CardDescription>
            Please read and confirm each condition. <PlaceholderTag>PLACEHOLDER wording</PlaceholderTag>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {offerAcknowledgements(form.termMonths).map((a) => (
            <div key={a.key}>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={!!form.acknowledgements[a.key]}
                  onCheckedChange={(v) => setForm({ ...form, acknowledgements: { ...form.acknowledgements, [a.key]: !!v } })}
                  className="mt-0.5"
                  aria-invalid={!!errors[`ack.${a.key}`]}
                />
                <span>{a.text}</span>
              </label>
              {errors[`ack.${a.key}`] && <p className="ml-7 text-xs font-medium text-destructive">{errors[`ack.${a.key}`]}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Signature</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="signedAt" label="Signed at (place)" error={errors.signedAtPlace}>
            <Input id="signedAt" placeholder="e.g. Harare" value={form.signedAtPlace} onChange={(e) => setForm({ ...form, signedAtPlace: e.target.value })} />
          </Field>
          <Field id="signedDate" label="Date" error={errors.signedDate}>
            <Input id="signedDate" type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} />
          </Field>
          <Field id="purchaserName" label="Purchaser name" error={errors.purchaserName} className="sm:col-span-2">
            <Input id="purchaserName" value={form.purchaserName} onChange={(e) => setForm({ ...form, purchaserName: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Tabs value={form.signatureType} onValueChange={(v) => setForm({ ...form, signatureType: v as "typed" | "drawn", signatureValue: "" })}>
              <TabsList>
                <TabsTrigger value="typed">Type signature</TabsTrigger>
                <TabsTrigger value="drawn">Draw signature</TabsTrigger>
              </TabsList>
              <TabsContent value="typed">
                <Input
                  aria-label="Typed signature"
                  placeholder="Type your full name"
                  className="font-serif text-xl italic"
                  value={form.signatureValue}
                  onChange={(e) => setForm({ ...form, signatureValue: e.target.value })}
                />
              </TabsContent>
              <TabsContent value="drawn">
                <SignaturePad invalid={!!errors.signatureValue} onChange={(v) => setForm((f) => ({ ...f, signatureValue: v }))} />
              </TabsContent>
            </Tabs>
            {errors.signatureValue && <p className="mt-1 text-xs font-medium text-destructive">{errors.signatureValue}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              This signs your offer. The legally binding Agreement of Sale is signed later via DocuSign.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit offer
      </Button>
    </form>
  );
}
