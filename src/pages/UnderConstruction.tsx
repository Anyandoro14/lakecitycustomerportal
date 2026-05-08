import { Construction, Wrench, HardHat, Clock } from "lucide-react";

const UnderConstruction = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="max-w-2xl w-full text-center">
        {/* Construction graphic */}
        <div className="relative mx-auto mb-10 h-40 w-40">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-primary/20" />
          <div className="relative flex h-full w-full items-center justify-center">
            <Construction className="h-20 w-20 text-primary" strokeWidth={1.5} />
          </div>
          <HardHat className="absolute -top-2 -right-2 h-10 w-10 text-amber-500" strokeWidth={1.5} />
          <Wrench className="absolute -bottom-1 -left-2 h-9 w-9 text-muted-foreground rotate-12" strokeWidth={1.5} />
        </div>

        <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-4">
          Site Under Construction
        </h1>

        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
          We're upgrading our systems to serve you better. The portal is
          temporarily unavailable while our team performs scheduled maintenance.
        </p>

        <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-6 py-3 mb-8">
          <Clock className="h-5 w-5 text-primary" />
          <span className="text-foreground font-medium">
            Back online: Monday, 11 May 2026
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card/50 p-6 text-left">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
            What's happening?
          </h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              Performance and reliability upgrades
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              Security hardening across the platform
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              Improvements to statements and reporting
            </li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          For urgent matters, contact us at{" "}
          <a
            href="mailto:info@lakecity.co.zw"
            className="text-primary hover:underline font-medium"
          >
            info@lakecity.co.zw
          </a>
        </p>

        <p className="mt-6 text-xs text-muted-foreground">
          — The LakeCity Tech Team
        </p>
      </div>
    </div>
  );
};

export default UnderConstruction;
