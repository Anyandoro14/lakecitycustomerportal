import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSupabase } from "@/config";

export default function IdReviewStep() {
  return (
    <WizardShell step="id-review" pollMs={4000}>
      {({ lead }) => (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            {lead.idReviewStatus === "id_pending_review" && (
              <>
                <div className="relative grid h-16 w-16 place-items-center rounded-full bg-accent">
                  <Clock className="h-8 w-8 text-gold" />
                  <span className="absolute inset-0 animate-ping rounded-full border-2 border-gold/40" />
                </div>
                <h1 className="font-serif text-2xl font-semibold">We're checking your ID</h1>
                <p className="max-w-md text-muted-foreground">
                  Thanks, {lead.buyer.fullName.split(" ")[0]}. A member of the LakeCity team is comparing your details with
                  your ID photo{lead.coOwners.length ? "s" : ""}. You'll be able to continue to your offer form as soon as
                  it's approved. You can keep this page open or come back to it later. <PlaceholderTag />
                </p>
                <p className="text-sm">Stand <strong>{lead.standNumber}</strong> · Reference {lead.id.slice(0, 8).toUpperCase()}</p>
                {!useSupabase && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Demo: approve this lead on the <Link className="underline" to={`/internal/leads/${lead.id}`}>staff review page</Link>.
                  </p>
                )}
              </>
            )}
            {lead.idReviewStatus === "rejected" && (
              <>
                <XCircle className="h-14 w-14 text-destructive" />
                <h1 className="font-serif text-2xl font-semibold">We couldn't verify your ID</h1>
                <p className="max-w-md text-muted-foreground">
                  Reason: <strong>{lead.idReviewReason ?? "Not specified"}</strong>. Please contact{" "}
                  <a className="underline" href="mailto:admin@lakecity.co.zw">admin@lakecity.co.zw</a> and quote reference{" "}
                  {lead.id.slice(0, 8).toUpperCase()}. <PlaceholderTag />
                </p>
              </>
            )}
            {lead.idReviewStatus === "approved" && (
              <>
                <CheckCircle2 className="h-14 w-14 text-primary" />
                <h1 className="font-serif text-2xl font-semibold">Your ID has been approved</h1>
                <p className="text-muted-foreground">Next, complete your offer to purchase stand {lead.standNumber}.</p>
                <Button asChild size="lg">
                  <Link to={`/apply/${lead.id}/offer`}>Continue to offer form</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </WizardShell>
  );
}
