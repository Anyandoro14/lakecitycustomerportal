import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Field } from "@/components/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backend, type StaffSession } from "@/lib/backend";

/** Staff-only area. Supabase mode: email/password sign-in + staff_users allow-list. Mock mode: open. */
export function StaffGate({ children }: { children: (staff: StaffSession) => React.ReactNode }) {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend.staffSession().then(setSession).catch(() => setSession(null));
  }, []);

  if (session === undefined) {
    return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!session) {
    return (
      <div className="container max-w-sm py-16">
        <Card>
          <CardHeader>
            <CardTitle>LakeCity staff sign-in</CardTitle>
            <CardDescription>Internal access only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  await backend.staffSignIn(email, password);
                  setSession(await backend.staffSession());
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Sign-in failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field id="staff-email" label="Email">
                <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field id="staff-password" label="Password" error={error ?? undefined}>
                <Input id="staff-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session.isStaff) {
    return (
      <div className="container max-w-md py-16">
        <Alert variant="destructive">
          <AlertDescription>{session.email} is not on the LakeCity staff list.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children(session)}</>;
}
