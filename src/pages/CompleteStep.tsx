import { ArrowUpRight, Eye, HandHeart, Scale, Sparkles } from "lucide-react";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { config } from "@/config";

export default function CompleteStep() {
  return (
    <WizardShell step="complete">
      {({ lead }) => (
        <div className="space-y-10">
          <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <div
              className="absolute inset-0 opacity-25"
              style={{ backgroundImage: "radial-gradient(circle at 50% 0%, hsl(var(--gold)) 0, transparent 55%)" }}
              aria-hidden
            />
            <div className="relative">
              <Sparkles className="mx-auto h-10 w-10 text-gold" />
              <PlaceholderTag className="mt-4 bg-white/10 text-white">PLACEHOLDER copy · needs QC + approval</PlaceholderTag>
              <h1 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
                Congratulations, {lead.buyer.fullName.split(" ")[0]}! Stand {lead.standNumber} is yours.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
                Welcome to the LakeCity family. Your agreement is signed and your customer portal is active.
              </p>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="font-serif text-2xl font-semibold">Our promise to you</h2>
              <PlaceholderTag />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: HandHeart, title: "Honesty", body: "PLACEHOLDER: We tell you clearly what you're paying for and what happens next, at every step." },
                { icon: Scale, title: "Integrity", body: "PLACEHOLDER: Your stand, your payments and your agreement are handled exactly as promised." },
                { icon: Eye, title: "Transparency", body: "PLACEHOLDER: Every payment you make is recorded and visible to you, whenever you want to check it." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-card p-5">
                  <Icon className="h-6 w-6 text-gold" />
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border-2 border-gold/60 bg-accent/40 p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-2xl font-semibold">Your customer portal</h2>
              <PlaceholderTag />
            </div>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              PLACEHOLDER: We built the LakeCity customer portal so you can follow your account. Log in anytime to get
              your up-to-date statement and track the payments you've made so far.
            </p>
            <Button asChild size="lg" className="mt-6">
              <a href={config.portalUrl} target="_blank" rel="noreferrer">
                Log in to your portal <ArrowUpRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Username: {lead.buyer.email} · Account {lead.collectionAccountId}
            </p>
          </section>
        </div>
      )}
    </WizardShell>
  );
}
