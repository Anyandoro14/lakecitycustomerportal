import { ArrowRight, FileSignature, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlaceholderTag } from "@/components/Placeholder";
import { Button } from "@/components/ui/button";
import { backend } from "@/lib/backend";

export default function Landing() {
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    backend
      .listStands()
      .then((s) => setAvailable(s.filter((x) => x.status === "available").length))
      .catch(() => setAvailable(null));
  }, []);

  return (
    <>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--gold)) 0, transparent 35%), radial-gradient(circle at 85% 70%, hsl(var(--gold)) 0, transparent 30%)",
          }}
          aria-hidden
        />
        <div className="container relative py-20 sm:py-28">
          <PlaceholderTag className="mb-5 bg-white/10 text-white">PLACEHOLDER campaign copy</PlaceholderTag>
          <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Own your stand at LakeCity. Deposit today, pay over 48 months.
          </h1>
          <p className="mt-5 max-w-xl text-base text-primary-foreground/80 sm:text-lg">
            PLACEHOLDER: a limited release of residential stands. Choose your stand, verify your ID, pay your deposit
            and sign your agreement of sale online.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Link to="/apply">
                Choose your stand <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <span className="text-sm text-primary-foreground/70">
              {available === null ? "Checking availability…" : `${available} stands currently available`}
            </span>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="mb-8 flex items-center gap-3">
          <h2 className="font-serif text-2xl font-semibold">How it works</h2>
          <PlaceholderTag />
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "1. Your details and ID", body: "Choose a stand and share your details and a photo of your national ID or passport. Our team checks it by hand." },
            { icon: Wallet, title: "2. Offer and deposit", body: "Complete the offer form, receive your 48-month payment schedule and pay your deposit securely via ZikiMall." },
            { icon: FileSignature, title: "3. Sign and track", body: "Sign your agreement of sale online, then activate your customer portal to track every payment." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-6">
              <Icon className="h-6 w-6 text-gold" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
