import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { StandLayout } from "@/components/StandLayout";
import { WizardProgress } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStand } from "@/hooks/useStand";
import { backend, type Contact } from "@/lib/backend";
import { validateContact, type ContactErrors } from "@shared/domain/contact.ts";

export default function StandPage() {
  const { standNumber } = useParams();
  const { stand, band, loading, error } = useStand(standNumber);

  return (
    <div className="container max-w-6xl py-8 sm:py-12">
      <Link to="/#stands" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> All stands
      </Link>
      <div className="mx-auto mb-8 max-w-3xl">
        <WizardProgress active="stand" />
      </div>
      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
        </div>
      ) : error || !stand ? (
        <Alert variant="destructive" className="mx-auto max-w-xl">
          <AlertTitle>Stand not found</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <StandLayout stand={stand} band={band}>
          {stand.status !== "available" ? (
            <div className="space-y-3">
              <h2 className="font-serif text-2xl font-semibold">This stand is reserved</h2>
              <p className="text-sm text-muted-foreground">Someone has already paid for stand {stand.standNumber}. Please choose another stand.</p>
              <Button asChild variant="outline">
                <Link to="/#stands">See available stands</Link>
              </Button>
            </div>
          ) : (
            <ContactPane standNumber={stand.standNumber} />
          )}
        </StandLayout>
      )}
    </div>
  );
}

function ContactPane({ standNumber }: { standNumber: string }) {
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact>({ fullName: "", email: "", phone: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateContact(contact);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const { leadId } = await backend.startApplication({ standNumber, contact });
      navigate(`/apply/${leadId}/offer`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start your application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Your details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Next you'll complete the digital offer form for stand {standNumber}. Nothing is charged until the payment step.
        </p>
      </div>
      <Field id="fullName" label="Full name" error={errors.fullName}>
        <Input id="fullName" autoComplete="name" value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} aria-invalid={!!errors.fullName} />
      </Field>
      <Field id="email" label="Email" error={errors.email}>
        <Input id="email" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={!!errors.email} />
      </Field>
      <Field id="phone" label="Phone" error={errors.phone} hint="We'll use this number with your stand number to set up your portal account.">
        <Input id="phone" type="tel" autoComplete="tel" placeholder="+263 77 000 0000" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!!errors.phone} />
      </Field>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue to offer form <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
