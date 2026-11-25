import { FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { backend } from "@/lib/backend";
import { paymentDueNowCents } from "@shared/domain/campaign.ts";
import { standFromReference } from "@shared/domain/iveri.ts";
import { formatUsd } from "@shared/domain/schedule.ts";

// Local demo stand-in for iVeri's hosted card page. Only routed in mock mode. No card data is collected:
// each button plays the card status AuthoriseInfo would report, then returns like iVeri does.
const CHOICES: { label: string; cardStatus: number | null; kind: string; variant?: "default" | "outline" | "ghost" }[] = [
  { label: "Approve (status 0)", cardStatus: 0, kind: "success", variant: "default" },
  { label: "Hot card (3)", cardStatus: 3, kind: "fail" },
  { label: "Denied (4)", cardStatus: 4, kind: "fail" },
  { label: "Please call (5)", cardStatus: 5, kind: "fail" },
  { label: "Unable to process (9)", cardStatus: 9, kind: "trylater" },
  { label: "Invalid card (14)", cardStatus: 14, kind: "fail" },
  { label: "3-D Secure required (255)", cardStatus: 255, kind: "error" },
  { label: "Cancel", cardStatus: null, kind: "fail", variant: "ghost" },
];

export default function MockIveri() {
  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const leadId = params.get("lead") ?? "";
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(choice: (typeof CHOICES)[number]) {
    setBusy(choice.label);
    setError(null);
    try {
      await backend.simulateCardResult?.(leadId, reference, choice.cardStatus);
      navigate(`/apply/${leadId}/payment?ref=${encodeURIComponent(reference)}&kind=${choice.kind}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mock payment failed.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card data-testid="mock-iveri">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-5 w-5 text-gold" /> Mock iVeri test page (local demo only)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Merchant</dt>
            <dd>LakeCity (CBZ, TEST)</dd>
            <dt className="text-muted-foreground">Stand</dt>
            <dd>{standFromReference(reference) ?? "Unknown"}</dd>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono">{reference}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-semibold">{formatUsd(paymentDueNowCents())} USD</dd>
          </dl>
          <Alert className="border-dashed">
            <AlertTitle>No card details here</AlertTitle>
            <AlertDescription>
              On the real flow this is CBZ's hosted iVeri page. Pick the result the bank should return. No money moves.
            </AlertDescription>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {CHOICES.map((c) => (
              <Button key={c.label} variant={c.variant ?? "outline"} disabled={busy !== null} onClick={() => void respond(c)}>
                {busy === c.label && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {c.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
