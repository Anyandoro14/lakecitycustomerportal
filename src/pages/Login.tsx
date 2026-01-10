import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { 
  emailSchema, 
  passwordSchema, 
  phoneSchema, 
  verificationCodeSchema,
  maskPhoneNumber,
  getPasswordErrors 
} from "@/lib/validation";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !showVerification) {
        navigate("/");
      }
    };
    checkAuth();
  }, [navigate, showVerification]);

  const validateLoginForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    const emailResult = emailSchema.safeParse(loginEmail);
    if (!emailResult.success) {
      newErrors.loginEmail = emailResult.error.errors[0].message;
    }
    
    if (!loginPassword) {
      newErrors.loginPassword = "Password is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignupForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    const emailResult = emailSchema.safeParse(signupEmail);
    if (!emailResult.success) {
      newErrors.signupEmail = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(signupPassword);
    if (!passwordResult.success) {
      newErrors.signupPassword = passwordResult.error.errors[0].message;
    }
    
    const phoneResult = phoneSchema.safeParse(signupPhone);
    if (!phoneResult.success) {
      newErrors.signupPhone = phoneResult.error.errors[0].message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLoginForm()) return;
    
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;

      if (data.user) {
        // Get user's phone number for 2FA
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', data.user.id)
          .single();

        if (profile?.phone_number) {
          // Sign out immediately - user must complete 2FA to get a valid session
          await supabase.auth.signOut();
          
          setPendingUserId(data.user.id);
          setPhoneNumber(profile.phone_number);
          
          // Send 2FA code
          const { error: verifyError } = await supabase.functions.invoke('send-2fa-code', {
            body: { phoneNumber: profile.phone_number }
          });

          if (verifyError) throw verifyError;

          setShowVerification(true);
          toast({
            title: "Verification code sent",
            description: "Please check your phone for the verification code",
          });
        } else {
          // No phone number, proceed without 2FA
          navigate("/");
        }
      }
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateSignupForm()) return;
    
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      if (data.user) {
        // Update profile with phone number
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ 
            phone_number: signupPhone
          })
          .eq('id', data.user.id);

        if (profileError) throw profileError;

        toast({
          title: "Account created",
          description: "Your account has been created. Please login to access your stand information.",
        });
        
        // Clear signup form
        setSignupEmail("");
        setSignupPassword("");
        setSignupPhone("");
      }
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const codeResult = verificationCodeSchema.safeParse(verificationCode);
    if (!codeResult.success) {
      setErrors({ verificationCode: codeResult.error.errors[0].message });
      return;
    }
    
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-2fa-code', {
        body: { phoneNumber, code: verificationCode }
      });

      if (error) throw error;

      if (data.verified) {
        // Re-authenticate user after successful 2FA
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword,
        });
        
        if (signInError) throw signInError;
        
        toast({
          title: "Verification successful",
          description: "You have been logged in",
        });
        navigate("/");
      } else {
        throw new Error("Invalid verification code");
      }
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    setShowVerification(false);
    setVerificationCode("");
    setPendingUserId(null);
    setPhoneNumber("");
  };

  const passwordErrors = getPasswordErrors(signupPassword);
  const maskedPhone = maskPhoneNumber(phoneNumber);

  if (showVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>
              Enter the verification code sent to {maskedPhone}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setErrors({ ...errors, verificationCode: '' });
                  }}
                  maxLength={6}
                  required
                  className={errors.verificationCode ? 'border-destructive' : ''}
                />
                {errors.verificationCode && (
                  <p className="text-sm text-destructive">{errors.verificationCode}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBackToLogin}
              >
                Back to Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src="/lakecity-logo.svg" 
              alt="LakeCity" 
              className="h-10 w-auto"
            />
          </div>
          <div>
            <CardTitle className="text-xl">Sign in to your LakeCity account</CardTitle>
            <CardDescription className="mt-1">Access your stand details, payments, and documents</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      setErrors({ ...errors, loginEmail: '' });
                    }}
                    required
                    className={errors.loginEmail ? 'border-destructive' : ''}
                  />
                  {errors.loginEmail && (
                    <p className="text-sm text-destructive">{errors.loginEmail}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setErrors({ ...errors, loginPassword: '' });
                    }}
                    required
                    className={errors.loginPassword ? 'border-destructive' : ''}
                  />
                  {errors.loginPassword && (
                    <p className="text-sm text-destructive">{errors.loginPassword}</p>
                  )}
                </div>
                
                <div className="text-right">
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    value={signupEmail}
                    onChange={(e) => {
                      setSignupEmail(e.target.value);
                      setErrors({ ...errors, signupEmail: '' });
                    }}
                    required
                    className={errors.signupEmail ? 'border-destructive' : ''}
                  />
                  {errors.signupEmail && (
                    <p className="text-sm text-destructive">{errors.signupEmail}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => {
                        setSignupPassword(e.target.value);
                        setErrors({ ...errors, signupPassword: '' });
                      }}
                      required
                      className={errors.signupPassword ? 'border-destructive pr-10' : 'pr-10'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {signupPassword && (
                    <div className="space-y-1 text-xs">
                      {['At least 8 characters', 'One uppercase letter', 'One lowercase letter', 'One number', 'One special character'].map((req) => {
                        const isMet = !passwordErrors.includes(req);
                        return (
                          <div key={req} className={`flex items-center gap-1 ${isMet ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {isMet ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            <span>{req}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Phone Number (for 2FA)</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="+1234567890"
                    value={signupPhone}
                    onChange={(e) => {
                      setSignupPhone(e.target.value);
                      setErrors({ ...errors, signupPhone: '' });
                    }}
                    required
                    className={errors.signupPhone ? 'border-destructive' : ''}
                  />
                  {errors.signupPhone && (
                    <p className="text-sm text-destructive">{errors.signupPhone}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Enter your phone number with country code (e.g., +1234567890)
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading || passwordErrors.length > 0}>
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
