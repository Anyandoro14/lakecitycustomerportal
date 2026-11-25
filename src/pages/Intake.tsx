import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CountrySelect, Field, NativeSelect } from "@/components/form";
import { PersonFields, emptyPerson, type PersonDraft, type PersonErrors } from "@/components/PersonFields";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardProgress } from "@/components/WizardShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { backend, type PersonSubmission, type Stand } from "@/lib/backend";
import { validateIdentity } from "@shared/domain/id-validation.ts";
import { MAX_CO_OWNERS } from "@shared/domain/types.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePerson(p: PersonDraft): PersonErrors {
  const e: PersonErrors = {};
  if (p.fullName.trim().length < 3) e.fullName = "Enter your full name.";
  if (!p.dateOfBirth) e.dateOfBirth = "Date of birth is required.";
  if (!EMAIL.test(p.email.trim())) e.email = "Enter a valid email address.";
  if (p.phone.replace(/\D/g, "").length < 7) e.phone = "Enter a valid phone number.";
  const id = validateIdentity({ idType: p.idType, issuingCountry: p.idIssuingCountry, idNumber: p.idNumber, expiryDate: p.idExpiry });
  if (id.errors.idType) e.idType = id.errors.idType;
  if (id.errors.issuingCountry) e.idIssuingCountry = id.errors.issuingCountry;
  if (id.errors.idNumber) e.idNumber = id.errors.idNumber;
  if (id.errors.expiryDate) e.idExpiry = id.errors.expiryDate;
  if (!p.idFront) e.idFront = p.idType === "passport" ? "Add a photo of your passport photo page." : "Add a photo of the front of your ID.";
  return e;
}

function toSubmission(p: PersonDraft): PersonSubmission {
  return {
    fullName: p.fullName,
    dateOfBirth: p.dateOfBirth,
    email: p.email,
    phone: p.phone,
    idType: p.idType as PersonSubmission["idType"],
    idIssuingCountry: p.idIssuingCountry,
    idNumber: p.idNumber,
    idExpiry: p.idExpiry || null,
    idFront: p.idFront!,
    idBack: p.idBack,
  };
}

export default function Intake() {
  const navigate = useNavigate();
  const [stands, setStands] = useState<Stand[] | null>(null);
  const [standsError, setStandsError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<PersonDraft>(emptyPerson());
  const [address, setAddress] = useState({ physicalAddress: "", postalAddress: "", country: "" });
  const [standNumber, setStandNumber] = useState("");
  const [coOwners, setCoOwners] = useState<PersonDraft[]>([]);
  const [errors, setErrors] = useState<{
    buyer: PersonErrors;
    coOwners: PersonErrors[];
    other: Partial<Record<"physicalAddress" | "postalAddress" | "country" | "standNumber", string>>;
  }>({ buyer: {}, coOwners: [], other: {} });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    backend.listStands().then(setStands).catch(() => setStandsError("We couldn't load the stand list. Please refresh."));
  }, []);

  const available = (stands ?? []).filter((s) => s.status === "available");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      buyer: validatePerson(buyer),
      coOwners: coOwners.map(validatePerson),
      other: {} as typeof errors.other,
    };
    if (address.physicalAddress.trim().length < 5) next.other.physicalAddress = "Enter your residential address.";
    if (address.postalAddress.trim().length < 5) next.other.postalAddress = "Enter your postal address (or repeat your residential address).";
    if (!address.country) next.other.country = "Choose your country of residence.";
    if (!standNumber) next.other.standNumber = "Choose a stand.";
    setErrors(next);
    const hasErrors =
      Object.keys(next.buyer).length || Object.keys(next.other).length || next.coOwners.some((c) => Object.keys(c).length);
    if (hasErrors) {
      toast.error("Please fix the highlighted fields.");
      requestAnimationFrame(() => document.querySelector("[aria-invalid='true'], .text-destructive")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setSubmitting(true);
    try {
      const { leadId } = await backend.submitIntake({
        buyer: { ...toSubmission(buyer), ...address },
        coOwners: coOwners.map(toSubmission),
        standNumber,
      });
      navigate(`/apply/${leadId}/id-review`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container max-w-3xl py-8 sm:py-12">
      <div className="mb-8">
        <WizardProgress active="intake" />
      </div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold">Choose your stand</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us who is buying and which stand you'd like. Your stand is only reserved once your deposit is paid.{" "}
          <PlaceholderTag />
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stand</CardTitle>
            <CardDescription>Sizes and prices are shown on the offer step (currently TBC).</CardDescription>
          </CardHeader>
          <CardContent>
            {standsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{standsError}</AlertDescription>
              </Alert>
            )}
            <Field id="standNumber" label="Stand number" error={errors.other.standNumber}>
              <NativeSelect id="standNumber" value={standNumber} invalid={!!errors.other.standNumber} disabled={!stands} onChange={(e) => setStandNumber(e.target.value)}>
                <option value="">{stands ? `Select one of ${available.length} available stands…` : "Loading stands…"}</option>
                {available.map((s) => (
                  <option key={s.standNumber} value={s.standNumber}>Stand {s.standNumber}</option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Buyer</CardTitle>
            <CardDescription>The main purchaser named on the offer and agreement of sale.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PersonFields prefix="buyer" value={buyer} errors={errors.buyer} onChange={(p) => setBuyer((b) => ({ ...b, ...p }))} />
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <Field id="physicalAddress" label="Residential (physical) address" error={errors.other.physicalAddress} className="sm:col-span-2">
                <Textarea id="physicalAddress" rows={2} autoComplete="street-address" value={address.physicalAddress} aria-invalid={!!errors.other.physicalAddress} onChange={(e) => setAddress((a) => ({ ...a, physicalAddress: e.target.value }))} />
              </Field>
              <Field id="postalAddress" label="Postal address" error={errors.other.postalAddress} className="sm:col-span-2">
                <Textarea id="postalAddress" rows={2} value={address.postalAddress} aria-invalid={!!errors.other.postalAddress} onChange={(e) => setAddress((a) => ({ ...a, postalAddress: e.target.value }))} />
              </Field>
              <Field id="country" label="Country of residence" error={errors.other.country}>
                <CountrySelect id="country" value={address.country} invalid={!!errors.other.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {coOwners.map((c, i) => (
          <Card key={i}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Co-owner {i + 1}</CardTitle>
                <CardDescription>Each co-owner needs their own ID and signs the agreement.</CardDescription>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => {
                setCoOwners((list) => list.filter((_, j) => j !== i));
                setErrors((er) => ({ ...er, coOwners: er.coOwners.filter((_, j) => j !== i) }));
              }}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove
              </Button>
            </CardHeader>
            <CardContent>
              <PersonFields
                prefix={`coowner${i + 1}`}
                value={c}
                errors={errors.coOwners[i] ?? {}}
                onChange={(p) => setCoOwners((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)))}
              />
            </CardContent>
          </Card>
        ))}

        {coOwners.length < MAX_CO_OWNERS && (
          <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setCoOwners((l) => [...l, emptyPerson()])}>
            <Plus className="mr-2 h-4 w-4" /> Add a co-owner (optional)
          </Button>
        )}

        <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
          <p>
            Your ID photos are personal data. They are stored privately, only LakeCity staff can view them, and they are
            used only to verify your identity for this purchase. <PlaceholderTag>PLACEHOLDER privacy copy</PlaceholderTag>
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit for ID check
        </Button>
      </form>
    </div>
  );
}
