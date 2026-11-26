import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardFrame } from "@/components/stand-sales/WizardFrame";
import { supabase } from "@/integrations/supabase/client";
import { standSalesApi, type ApplicationView } from "@/lib/stand-sales/api";
import { readStandSession } from "@/lib/stand-sales/session";

type Phase = "create" | "login" | "code" | "ready";

export default function StandPortalPage() {
  const { standNumber = "" } = useParams();
  const session = readStandSession();
  const [application, setApplication] = useState<ApplicationView | null>(null);
  const [phase, setPhase] = useState<Phase>("create");
  const [password, setPassword] = useState("");
  const [loginStand, setLoginStand] = useState(standNumber);
  const [loginPassword, setLoginPassword] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const current = readStandSession();
    if (!current || current.standNumber !== standNumber) return;
    standSalesApi.get(current.applicationId, current.accessToken).then((res) => {
      setApplication(res.application);
      if (res.application.portalReady) setPhase("login");
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load your application."));
  }, [standNumber]);

  async function createLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await standSalesApi.createPortalLogin(session.applicationId, session.accessToken, standNumber, password);
      setLoginPassword(password);
      setPhase("login");
      setInfo("Password saved. Sign in with your stand number. We will ask for a verification code, the same way as the customer portal. No password is emailed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the login.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: lookup, error: lookupError } = await supabase.functions.invoke("lookup-stand-email", { body: { standNumber: loginStand.trim() } });
      if (lookupError) throw lookupError;
      if (!lookup?.found || !lookup?.email) throw new Error(lookup?.error || "No account found for this stand number.");
      const { data, error: signError } = await supabase.auth.signInWithPassword({ email: lookup.email, password: loginPassword });
      if (signError) throw signError;
      const signedIn = data.user;
      if (!signedIn) throw new Error("Sign-in did not return a user.");
      const { data: profile } = await supabase.from("profiles").select("email, phone_number").eq("id", signedIn.id).maybeSingle();
      await supabase.auth.signOut();
      setEmail(profile?.email || lookup.email);
      setUserId(signedIn.id);
      const destination = profile?.phone_number || profile?.email || lookup.email;
      const channel = profile?.phone_number ? "sms" : "email";
      const { error: sendError } = await supabase.functions.invoke("send-2fa-code", {
        body: channel === "sms" ? { userId: signedIn.id, channel, phoneNumber: destination } : { userId: signedIn.id, channel, email: destination },
      });
      if (sendError) setInfo("We couldn't deliver a verification code. If support gave you a bypass code, enter it below.");
      else setInfo(`Enter the verification code sent for stand ${loginStand}.`);
      setPhase("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data, error: verifyError } = await supabase.functions.invoke("verify-2fa-code", {
        body: { userId, channel: "email", email, code },
      });
      if (verifyError) throw verifyError;
      if (!data?.verified) {
        const sms = await supabase.functions.invoke("verify-2fa-code", { body: { userId, channel: "sms", phoneNumber: application?.phone, code } });
        if (!sms.data?.verified) throw new Error(data?.error || sms.data?.error || "Incorrect code.");
      }
      const { error: signError } = await supabase.auth.signInWithPassword({ email, password: loginPassword });
      if (signError) throw signError;
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardFrame step={4}>
      <div className="mx-auto max-w-lg space-y-4" data-testid="buyer-portal">
        <p className="text-sm text-muted-foreground">Signed up · Paid · Portal. Sign in with your stand number, password, and a verification code.</p>
        <h1 className="font-display text-3xl">Your LakeCity portal</h1>
        {application?.stage === "paid" && <p>Stand {application.standNumber} · {application.fullName}</p>}
        {info && <p className="text-sm">{info}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!application && session?.standNumber === standNumber && <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading portal" />}
        {phase === "create" && application?.stage === "paid" && !application.portalReady && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <form onSubmit={createLogin} className="space-y-4" data-testid="create-portal-login">
                <div className="space-y-2">
                  <Label htmlFor="portal-stand">Stand number</Label>
                  <Input id="portal-stand" value={standNumber} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal-password">Choose a password</Label>
                  <Input id="portal-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
                </div>
                <Button type="submit" disabled={busy}>Save password and continue to sign-in</Button>
              </form>
            </CardContent>
          </Card>
        )}
        {phase === "login" && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={signIn} className="space-y-4" data-testid="portal-login">
                <div className="space-y-2">
                  <Label htmlFor="login-stand">Stand number</Label>
                  <Input id="login-stand" value={loginStand} onChange={(event) => setLoginStand(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required />
                </div>
                <Button type="submit" disabled={busy}>Continue to verification</Button>
              </form>
            </CardContent>
          </Card>
        )}
        {phase === "code" && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={verify} className="space-y-4" data-testid="portal-2fa">
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification code</Label>
                  <Input id="otp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
                </div>
                <Button type="submit" disabled={busy}>Verify and open portal</Button>
              </form>
            </CardContent>
          </Card>
        )}
        {phase === "ready" && (
          <Card data-testid="portal-ready">
            <CardContent className="space-y-3 p-6">
              <h2 className="font-display text-2xl">You are signed in</h2>
              <p>Stand {standNumber}. Your collection schedule is prepared as a preview only. Nothing was written to Odoo, and no customer email or WhatsApp was sent.</p>
              <p className="text-sm text-muted-foreground">Balance after the down payment is collected over 48 months, due on the 5th. The last instalment absorbs rounding.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </WizardFrame>
  );
}
