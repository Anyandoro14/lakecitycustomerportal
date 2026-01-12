import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { standNumberSchema } from "@/lib/validation";

const ForgotPassword = () => {
  const { toast } = useToast();
  const [standNumber, setStandNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate stand number
    const standResult = standNumberSchema.safeParse(standNumber);
    if (!standResult.success) {
      setError(standResult.error.errors[0].message);
      return;
    }

    setLoading(true);

    try {
      // Look up email from stand number
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke('lookup-stand-email', {
        body: { standNumber: standNumber.trim() }
      });

      if (lookupError) {
        console.error("Lookup error:", lookupError);
        // Don't reveal if stand number exists - show success anyway
        setSubmitted(true);
        return;
      }

      if (!lookupData?.found || !lookupData?.email) {
        // Don't reveal if stand number exists - show success anyway
        setSubmitted(true);
        return;
      }

      // Send password reset email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(lookupData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      // Always show success message to prevent enumeration
      setSubmitted(true);
    } catch (err: any) {
      // Don't reveal if stand number exists or not for security
      console.error("Password reset error:", err);
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription className="text-base">
              If your stand number was found, a password reset link has been sent to the email associated with it. Be sure to check your spam/junk folders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                The reset link will expire in 30 minutes. If you don't receive an email, please try again or contact support.
              </AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setStandNumber("");
                }}
                className="w-full"
              >
                Try a different stand number
              </Button>
              <Link to="/login" className="w-full">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Enter your stand number and we'll send a password reset link to the email associated with your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="standNumber">Stand Number</Label>
              <Input
                id="standNumber"
                type="text"
                placeholder="e.g., A123"
                value={standNumber}
                onChange={(e) => {
                  setStandNumber(e.target.value);
                  setError("");
                }}
                required
                className={error ? "border-destructive" : ""}
                disabled={loading}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            
            <Alert>
              <AlertDescription className="text-sm text-muted-foreground">
                For security, we'll only send a reset link if this stand number is registered with LakeCity. If you don't receive an email, please check your spam folder or contact support.
              </AlertDescription>
            </Alert>

            <Button type="submit" className="w-full" disabled={loading || !standNumber}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>

            <Link to="/login" className="block">
              <Button variant="ghost" className="w-full" type="button">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;