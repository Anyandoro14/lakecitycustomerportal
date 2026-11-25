import { KeyRound, Loader2, Mail, UserCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { PlaceholderTag } from "@/components/Placeholder";
import { WizardShell } from "@/components/WizardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { config } from "@/config";
import { backend, type Lead } from "@/lib/backend";

export default function PortalStep() {
  return (
    <WizardShell step="portal">
      {({ lead, refresh }) => <PortalView lead={lead} refresh={refresh} />}
    </WizardShell>
  );
}

function PortalView({ lead, refresh }: { lead: Lead; refresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkRequested, setLinkRequested] = useState(false);

  async function activate(method: Parameters<typeof backend.activatePortal>[1]) {
    setBusy(true);
    try {
      await backend.activatePortal(lead.id, method);
      await refresh();
      navigate(`/apply/${lead.id}/complete`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setError(null);
    void activate({ kind: "password", password });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Activate your customer portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We've created your LakeCity customer portal account and linked it to your collection schedule. Activate it now
          to finish. You'll use it to view your statement and track every payment. <PlaceholderTag />
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Your portal account</CardTitle>
            <CardDescription>{config.portalUrl.replace(/^https?:\/\//, "")}</CardDescription>
          </div>
          <Badge variant={lead.portalStatus === "activated" ? "default" : "secondary"} className="capitalize">
            {lead.portalStatus.replace("_", " ")}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 rounded-lg bg-muted/60 p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Username (email)</dt><dd className="font-medium break-all">{lead.buyer.email}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Stand</dt><dd className="font-medium">{lead.standNumber}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Collection account</dt><dd className="font-medium">{lead.collectionAccountId}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="password">
            <TabsList className="mb-4">
              <TabsTrigger value="password"><KeyRound className="mr-1.5 h-4 w-4" /> Set a password</TabsTrigger>
              <TabsTrigger value="magic"><Mail className="mr-1.5 h-4 w-4" /> Magic link</TabsTrigger>
            </TabsList>
            <TabsContent value="password">
              <form onSubmit={submitPassword} className="grid gap-4 sm:max-w-sm" noValidate>
                <input type="email" autoComplete="username" value={lead.buyer.email} readOnly hidden />
                <Field id="pw" label="New password" hint="At least 10 characters.">
                  <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Field id="pw2" label="Confirm password" error={error ?? undefined}>
                  <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                  Activate portal
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="magic" className="space-y-3 text-sm">
              <p>We'll email a one-time sign-in link to <strong>{lead.buyer.email}</strong>. Opening it activates your account.</p>
              {!linkRequested ? (
                <Button variant="outline" onClick={() => setLinkRequested(true)}>Send magic link</Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-dashed border-gold bg-accent/40 p-4">
                  <p className="text-xs">
                    Developer mode: magic-link emails are not sent in this build. Simulate the customer opening the link:
                  </p>
                  <Button size="sm" onClick={() => activate({ kind: "magic_link" })} disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simulate opening the magic link
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
