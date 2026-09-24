import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Narrow typed wrapper around the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; client_name?: string; redirect_uri?: string };
type OAuthDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { redirect_url?: string; redirect_to?: string };
const oauth = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
      approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
      denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
    };
  }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the request URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      setUserEmail(sess.session.user.email ?? null);
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "an application";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">
            Connect {clientName} to your account
          </CardTitle>
          <CardDescription>
            {userEmail
              ? `Signed in as ${userEmail}. This lets ${clientName} use the StandLedger portal as you.`
              : `This lets ${clientName} use the StandLedger portal as you.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {!details && !error && (
            <p className="text-sm text-muted-foreground">Loading authorization request…</p>
          )}
          {details && (
            <>
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Application: </span>
                  <span className="font-medium">{clientName}</span>
                </p>
                {details.client?.redirect_uri && (
                  <p className="break-all">
                    <span className="text-muted-foreground">Redirects to: </span>
                    <span className="font-mono text-xs">{details.client.redirect_uri}</span>
                  </p>
                )}
                {scopes.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Requested access: </span>
                    <span>{scopes.join(", ")}</span>
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {clientName} will be able to call this app's enabled tools while you are signed in.
                Your existing account permissions and data-access policies still apply.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => decide(true)} disabled={busy} className="flex-1">
                  Approve
                </Button>
                <Button onClick={() => decide(false)} disabled={busy} variant="outline" className="flex-1">
                  Deny
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
