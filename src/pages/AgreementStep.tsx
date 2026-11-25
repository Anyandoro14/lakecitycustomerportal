import { CheckCircle2, ExternalLink, FileText, FlaskConical, Loader2, PlugZap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { backend, type Lead, type SigningSession } from "@/lib/backend";
import { mountFocusedView } from "@/lib/docusign";
import { AGREEMENT_TEMPLATE_PATH } from "@shared/domain/agreement-fields.ts";

export default function AgreementStep() {
  return (
    <WizardShell step="agreement" pollMs={5000}>
      {({ lead, refresh }) => <AgreementView lead={lead} refresh={refresh} />}
    </WizardShell>
  );
}

function AgreementView({ lead, refresh }: { lead: Lead; refresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState<SigningSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [finishing, setFinishing] = useState(params.get("event") === "signing_complete");
  const [simulating, setSimulating] = useState(false);

  const loadSession = useCallback(async () => {
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/apply/${lead.id}/agreement`;
      setSession(await backend.getSigningSession(lead.id, returnUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare your agreement.");
    }
  }, [lead.id]);

  useEffect(() => {
    if (lead.stage === "signed") return;
    if (finishing) return;
    void loadSession();
  }, [lead.stage, finishing, loadSession]);

  useEffect(() => {
    if (session?.status !== "ready") return;
    setEmbedFailed(false);
    mountFocusedView({
      integrationKey: session.integrationKey,
      url: session.url,
      selector: "#docusign-agreement",
      onReady: () => undefined,
      onSessionEnd: (type) => {
        if (type === "signing_complete") {
          setFinishing(true);
          // Next co-owner (if any) gets a fresh session after a short pause.
          setTimeout(() => {
            setFinishing(false);
            void refresh().then(loadSession);
          }, 2500);
        } else {
          toast.message("Signing was not completed. You can resume at any time.");
          void loadSession();
        }
      },
    }).catch(() => setEmbedFailed(true));
  }, [session, refresh, loadSession]);

  if (lead.stage === "signed") {
    return (
      <Card>
        <CardContent className="space-y-4 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          <h1 className="font-serif text-2xl font-semibold">Agreement signed</h1>
          <p className="text-muted-foreground">
            Stand {lead.standNumber} is now allocated to you. DocuSign will email you the completed, signed copy.
          </p>
          <Button asChild size="lg">
            <Link to={`/apply/${lead.id}/portal`}>Activate your customer portal</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Agreement of sale</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Read the full agreement and sign it inside the secure DocuSign window. Each co-owner signs in turn on this
          device. Your stand is allocated to you once everyone has signed. <PlaceholderTag />
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(finishing || session?.status === "waiting_for_completion") && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Finalising your agreement…</AlertTitle>
          <AlertDescription>
            We're waiting for DocuSign to confirm the envelope is complete. This page updates automatically.
            {finishing && params.get("event") && (
              <Button variant="link" className="h-auto p-0 pl-1" onClick={() => { setParams({}); setFinishing(false); }}>
                Back to signing
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!session && !error && !finishing && (
        <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {session?.status === "ready" && !finishing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Signing as {session.signerName}</CardTitle>
            <CardDescription>Signer {session.signerIndex + 1} of {session.totalSigners}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div id="docusign-agreement" className="min-h-[640px] w-full overflow-hidden rounded-md border bg-muted/30" />
            {embedFailed && (
              <Alert>
                <AlertTitle>The embedded signing window couldn't load</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>You can sign on DocuSign's page instead. You'll come straight back here afterwards.</p>
                  <Button onClick={() => window.location.assign(session.url)}>
                    Open signing page <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {session?.status === "not_configured" && (
        <>
          <Alert className="border-dashed">
            <PlugZap className="h-4 w-4" />
            <AlertTitle>DocuSign is not configured</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{session.message}</p>
              <p className="text-xs text-muted-foreground">
                Needs DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_PRIVATE_KEY and
                DOCUSIGN_BASE_PATH (demo) as Supabase function secrets, plus VITE_DOCUSIGN_INTEGRATION_KEY. See README.
              </p>
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agreement preview</CardTitle>
              <CardDescription>The placeholder template that will be filled with your details and sent for signature.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href={AGREEMENT_TEMPLATE_PATH} target="_blank" rel="noreferrer">
                  <FileText className="mr-2 h-4 w-4" /> Open placeholder agreement (PDF)
                </a>
              </Button>
            </CardContent>
          </Card>
          {session.simulationAllowed && (
            <Alert className="border-dashed border-gold bg-accent/40">
              <FlaskConical className="h-4 w-4" />
              <AlertTitle>Developer mode</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Simulate the DocuSign Connect "envelope completed" webhook: marks the stand signed and moves the lead to the signed list.</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={simulating}
                  onClick={async () => {
                    setSimulating(true);
                    try {
                      await backend.simulateSigningCompleted(lead.id);
                      await refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Simulation failed.");
                    } finally {
                      setSimulating(false);
                    }
                  }}
                >
                  {simulating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simulate agreement signed
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
