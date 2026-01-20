import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle, Loader2, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import logoMonogram from "@/assets/logo-monogram-sea-green.svg";
import ForcePasswordChange from "@/components/ForcePasswordChange";

const InternalLogin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkForcePasswordChange = async (userId: string) => {
    const { data } = await supabase
      .from('internal_users')
      .select('force_password_change')
      .eq('user_id', userId)
      .single();
    
    return data?.force_password_change || false;
  };

  const checkExistingSession = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const userEmail = session.user.email?.toLowerCase() || "";
        if (userEmail.endsWith("@lakecity.co.zw")) {
          // Check if password change is required
          const needsPasswordChange = await checkForcePasswordChange(session.user.id);
          if (needsPasswordChange) {
            setForcePasswordChange(true);
            setCurrentUserId(session.user.id);
            setCurrentUserEmail(userEmail);
            setLoading(false);
            return;
          }
          navigate("/internal-portal");
          return;
        }

        // Not a LakeCity email, sign them out
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("Session check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      const redirectUrl = `${window.location.origin}/internal-portal`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            hd: 'lakecity.co.zw', // Restrict to LakeCity domain at Google level
          }
        }
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast.error("Failed to sign in. Please try again.");
      setSigningIn(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.toLowerCase().endsWith("@lakecity.co.zw")) {
      toast.error("Only @lakecity.co.zw emails are permitted.");
      return;
    }

    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });

      if (error) throw error;

      // Check if password change is required
      if (data.user) {
        const needsPasswordChange = await checkForcePasswordChange(data.user.id);
        if (needsPasswordChange) {
          setForcePasswordChange(true);
          setCurrentUserId(data.user.id);
          setCurrentUserEmail(data.user.email || email);
          setSigningIn(false);
          return;
        }
      }

      toast.success("Signed in successfully!");
      navigate("/internal-portal");
    } catch (error: any) {
      console.error("Sign in error:", error);
      toast.error(error.message || "Failed to sign in. Please try again.");
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasswordChanged = () => {
    setForcePasswordChange(false);
    toast.success("Password changed! Welcome to the portal.");
    navigate("/internal-portal");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show password change screen if required
  if (forcePasswordChange && currentUserId && currentUserEmail) {
    return (
      <ForcePasswordChange
        userId={currentUserId}
        userEmail={currentUserEmail}
        onPasswordChanged={handlePasswordChanged}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto">
            <img src={logoMonogram} alt="LakeCity" className="h-16 w-16" />
          </div>
          <div>
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Internal Portal
            </CardTitle>
            <CardDescription className="mt-2">
              LakeCity Staff Only
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Restricted Access
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                  This area is strictly for LakeCity employees. Sign in with your @lakecity.co.zw account.
                </p>
              </div>
            </div>
          </div>

          {showEmailLogin ? (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@lakecity.co.zw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <Button 
                type="submit"
                disabled={signingIn}
                className="w-full h-12 text-base"
                size="lg"
              >
                {signingIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
              <Button 
                type="button"
                variant="ghost"
                onClick={() => setShowEmailLogin(false)}
                className="w-full"
              >
                Back to Google Sign-In
              </Button>
            </form>
          ) : (
            <>
              <Button 
                onClick={handleGoogleSignIn} 
                disabled={signingIn}
                className="w-full h-12 text-base"
                size="lg"
              >
                {signingIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button 
                variant="outline"
                onClick={() => setShowEmailLogin(true)} 
                className="w-full h-12 text-base"
                size="lg"
              >
                <Mail className="h-5 w-5 mr-2" />
                Sign in with Email
              </Button>
            </>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">New staff member?</span>
            </div>
          </div>

          <Link to="/internal-signup">
            <Button 
              variant="secondary"
              className="w-full h-12 text-base"
              size="lg"
            >
              <UserPlus className="h-5 w-5 mr-2" />
              Create Staff Account
            </Button>
          </Link>

          <p className="text-center text-xs text-muted-foreground">
            Only @lakecity.co.zw accounts are permitted.
            <br />
            Customer accounts cannot access this area.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default InternalLogin;
