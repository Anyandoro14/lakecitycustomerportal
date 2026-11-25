import { ArrowRight, FileText, Mail, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@shared/domain/schedule.ts";

export default function CelebrationStep() {
  return (
    <WizardShell step="celebration">
      {({ lead }) => {
        const first = (lead.offer?.buyer.fullName ?? lead.contact.fullName).split(" ")[0];
        return (
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12" data-testid="celebration">
              <div
                className="absolute inset-0 opacity-25"
                style={{ backgroundImage: "radial-gradient(circle at 50% 0%, hsl(var(--gold)) 0, transparent 55%)" }}
                aria-hidden
              />
              <div className="relative">
                <Sparkles className="mx-auto h-10 w-10 text-gold" />
                <PlaceholderTag className="mt-4 bg-white/10 text-white">PLACEHOLDER copy · needs QC + approval</PlaceholderTag>
                <h1 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
                  Congratulations, {first}! Stand {lead.standNumber} is reserved for you.
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
                  Thank you for your payment of {lead.paymentAmountCents ? formatUsd(lead.paymentAmountCents) : "your down payment and legal fee"}. Welcome to
                  the LakeCity family.
                </p>
                <dl className="mx-auto mt-6 grid max-w-md gap-2 rounded-lg bg-white/10 p-4 text-left text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-primary-foreground/70">Stand</dt><dd className="font-medium">{lead.standNumber}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-primary-foreground/70">Payment reference</dt><dd className="font-medium">{lead.paymentReference}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-primary-foreground/70">Paid on</dt><dd className="font-medium">{lead.paidAt?.slice(0, 10)}</dd></div>
                </dl>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <Mail className="h-6 w-6 text-gold" />
                <h2 className="mt-3 font-semibold">Your thank-you email</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Your payment automatically triggers a thank-you email to {lead.contact.email} with a link to your offer.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Preview: the email is queued in the LakeCity outbox until email sending is switched on (OI-TBC-20).</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <FileText className="h-6 w-6 text-gold" />
                <h2 className="mt-3 font-semibold">Your offer</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">View or download the offer to purchase you signed.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to={`/apply/${lead.id}/offer`}>View your offer</Link>
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border-2 border-gold/60 bg-accent/40 p-6 sm:p-8">
              <h2 className="font-serif text-2xl font-semibold">One last step: your portal account</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Confirm your stand number and phone number and we'll set up your account records so you can follow your payments.
              </p>
              <Button asChild size="lg" className="mt-5">
                <Link to={`/apply/${lead.id}/portal`}>
                  Set up your portal account <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </section>
          </div>
        );
      }}
    </WizardShell>
  );
}
