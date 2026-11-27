import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { standSalesApi, type StandCard } from "@/lib/stand-sales/api";
import { formatMoney } from "@/lib/stand-sales/money";
import { readStandSession, saveStandSession } from "@/lib/stand-sales/session";
import spineRoad from "@/assets/stand-sales/luxe/hero-real-spine-road-aerial.jpg";

export default function StandDetailPage() {
  const { standNumber = "" } = useParams();
  const navigate = useNavigate();
  const [stand, setStand] = useState<StandCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"contact" | "offer">("contact");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [nextOfKin, setNextOfKin] = useState("");
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    standSalesApi.listStands().then((res) => {
      if (cancelled) return;
      setStand(res.stands.find((item) => item.standNumber === standNumber) ?? null);
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Could not load this stand.");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [standNumber]);

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const started = await standSalesApi.start({ standNumber, fullName, email, phone });
      saveStandSession(started);
      setStep("offer");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start your application.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOffer(event: React.FormEvent) {
    event.preventDefault();
    const session = readStandSession();
    if (!session || session.standNumber !== standNumber) {
      setFormError("Start with your contact details.");
      setStep("contact");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await standSalesApi.submitOffer(session.applicationId, session.accessToken, { idNumber, address, nextOfKin, signature, accepted });
      navigate(`/stands/${standNumber}/pay`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the reservation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame step={step === "contact" ? 0 : 1}>
      <Link to="/stands" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">All stands</Link>
      {loading && <Loader2 className="mt-8 h-6 w-6 animate-spin" aria-label="Loading stand" />}
      {error && <p className="mt-8">{error}</p>}
      {!loading && !error && !stand && <p className="mt-8">Stand {standNumber} was not found.</p>}
      {stand && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <Card className="overflow-hidden border-border/80" data-testid="stand-summary">
            <div className="relative h-56 md:h-72">
              <img src={spineRoad} alt="LakeCity aerial, February 2026" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(160_70%_8%/0.92)] via-[hsl(160_70%_10%/0.55)] to-[hsl(160_45%_14%/0.28)]" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="text-[0.68rem] tracking-[0.16em] text-[hsl(40_33%_96%)]" aria-hidden="true">LakeCity aerial, February 2026</p>
                <h1 className="mt-2 font-display text-[2rem] leading-tight text-[hsl(40_33%_96%)] md:text-5xl">Stand {stand.standNumber}</h1>
              </div>
            </div>
            <CardContent className="space-y-2 p-6 md:p-8">
              <p className="text-sm text-muted-foreground">{stand.sizeSqm} m² · Phase {stand.phase} · Range {stand.band}</p>
              <p className="text-lg text-foreground">{formatMoney(stand.priceCents)} incl. 15.5% VAT</p>
              <p>Down payment $1,750.00</p>
              <p>Legal fee $500.00</p>
              <p className="font-medium text-primary">Due now $2,250.00</p>
              {!stand.available && <p>This stand is reserved.</p>}
            </CardContent>
          </Card>
          {stand.available && step === "contact" && (
            <form onSubmit={saveContact} className="space-y-5 rounded-2xl border border-border/80 bg-card p-6 shadow-sm md:p-8" data-testid="contact-form">
              <h2 className="font-display text-[2rem] leading-tight text-primary">Your details, to begin.</h2>
              <Field id="fullName" label="Full name" value={fullName} onChange={setFullName} />
              <Field id="email" label="Email" value={email} onChange={setEmail} type="email" />
              <Field id="phone" label="Phone" value={phone} onChange={setPhone} type="tel" />
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Continue to reserve"}</Button>
            </form>
          )}
          {stand.available && step === "offer" && (
            <form onSubmit={saveOffer} className="space-y-5 rounded-2xl border border-border/80 bg-card p-6 shadow-sm md:p-8" data-testid="offer-form">
              <h2 className="font-display text-[2rem] leading-tight text-primary">Reserve stand {stand.standNumber}</h2>
              <p className="font-body text-sm leading-relaxed text-foreground">We will hold this stand in your name while you complete the initial payment.</p>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">Purchaser {fullName}. Your details reserve this stand while you complete your initial payment. Your formal Agreement of Sale is completed after payment.</p>
              <Field id="idNumber" label="ID or passport number" value={idNumber} onChange={setIdNumber} />
              <Field id="address" label="Address" value={address} onChange={setAddress} />
              <Field id="nextOfKin" label="Next of kin" value={nextOfKin} onChange={setNextOfKin} />
              <label className="flex min-h-11 items-start gap-3 py-1 font-body text-sm leading-6">
                <input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                I confirm these reservation details and accept the initial payment of USD 2,250.00 (USD 1,750.00 down payment and USD 500.00 legal fee).
              </label>
              <Field id="signature" label="Type your full name to confirm your reservation" value={signature} onChange={setSignature} />
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Continue to payment"}</Button>
            </form>
          )}
        </div>
      )}
    </WizardFrame>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} required />
    </div>
  );
}
