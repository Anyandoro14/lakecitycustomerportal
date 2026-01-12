import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { 
  emailSchema, 
  passwordSchema, 
  phoneSchema, 
  verificationCodeSchema,
  standNumberSchema,
  maskPhoneNumber,
  getPasswordErrors 
} from "@/lib/validation";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import logoMonogram from "@/assets/logo-monogram-sea-green.svg";

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 3;

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  
  // Resend 2FA state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Login form state
  const [loginStandNumber, setLoginStandNumber] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [userEmail, setUserEmail] = useState(""); // Store email for re-auth after 2FA
  
  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // Start cooldown timer
  const startCooldownTimer = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
    }
    
    cooldownIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
            cooldownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

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
    
    const standResult = standNumberSchema.safeParse(loginStandNumber);
    if (!standResult.success) {
      newErrors.loginStandNumber = standResult.error.errors[0].message;
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

  const sendVerificationCode = async (phone: string): Promise<boolean> => {
    try {
      const { error: verifyError } = await supabase.functions.invoke('send-2fa-code', {
        body: { phoneNumber: phone }
      });

      if (verifyError) throw verifyError;
      return true;
    } catch (error: any) {
      console.error("Failed to send verification code:", error);
      throw error;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLoginForm()) return;
    
    setLoading(true);

    try {
      // First, look up the user's email by stand number
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, phone_number')
        .eq('stand_number', loginStandNumber.trim())
        .maybeSingle();

      if (profileError) throw profileError;
      
      if (!profile || !profile.email) {
        throw new Error("No account found for this stand number. Please check your stand number or contact support.");
      }

      // Store email for re-auth after 2FA
      setUserEmail(profile.email);

      // Authenticate with the found email
      const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: loginPassword,
      });

      if (error) throw error;

      if (data.user) {
        if (profile.phone_number) {
          // Sign out immediately - user must complete 2FA to get a valid session
          await supabase.auth.signOut();
          
          setPendingUserId(data.user.id);
          setPhoneNumber(profile.phone_number);
          
          // Reset resend state for new login attempt
          setResendAttempts(0);
          setResendCooldown(0);
          
          // Send 2FA code
          await sendVerificationCode(profile.phone_number);
          
          // Start cooldown after initial send
          startCooldownTimer();

          setShowVerification(true);
          toast({
            title: "WhatsApp verification code sent",
            description: `We've sent a 6-digit code via WhatsApp to ${maskPhoneNumber(profile.phone_number)}`,
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

  const handleResendCode = async () => {
    if (resendCooldown > 0 || resendAttempts >= MAX_RESEND_ATTEMPTS || isResending) {
      return;
    }

    setIsResending(true);

    try {
      await sendVerificationCode(phoneNumber);
      
      setResendAttempts((prev) => prev + 1);
      startCooldownTimer();
      
      toast({
        title: "New WhatsApp code sent",
        description: `A new verification code has been sent via WhatsApp to ${maskPhoneNumber(phoneNumber)}`,
      });
    } catch (error: any) {
      toast({
        title: "Unable to resend code",
        description: "Please wait a moment and try again. If the issue continues, contact support.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
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
        // Re-authenticate user after successful 2FA using stored email
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
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
    // Clear cooldown timer
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    
    setShowVerification(false);
    setVerificationCode("");
    setPendingUserId(null);
    setPhoneNumber("");
    setResendAttempts(0);
    setResendCooldown(0);
  };

  const passwordErrors = getPasswordErrors(signupPassword);
  const maskedPhone = maskPhoneNumber(phoneNumber);
  const canResend = resendCooldown === 0 && resendAttempts < MAX_RESEND_ATTEMPTS && !isResending;
  const remainingResends = MAX_RESEND_ATTEMPTS - resendAttempts;

  if (showVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>WhatsApp Verification</CardTitle>
            <CardDescription>
              We've sent a 6-digit verification code via WhatsApp to {maskedPhone}
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
              
              {/* Resend Code Section */}
              <div className="text-center space-y-2 py-2">
                <p className="text-sm text-muted-foreground">
                  Didn't receive a code?
                </p>
                
                {resendAttempts >= MAX_RESEND_ATTEMPTS ? (
                  <p className="text-sm text-muted-foreground">
                    Maximum resend attempts reached. Please contact support if you need assistance.
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResendCode}
                      disabled={!canResend}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                      {isResending 
                        ? "Sending..." 
                        : resendCooldown > 0 
                          ? `Resend code in ${resendCooldown}s` 
                          : "Resend code"
                      }
                    </Button>
                    {resendAttempts > 0 && remainingResends > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {remainingResends} resend{remainingResends !== 1 ? 's' : ''} remaining
                      </p>
                    )}
                  </div>
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
            {/* Wordmark for desktop, Monogram for mobile */}
            <img 
              src={logoWordmark} 
              alt="LakeCity" 
              className="hidden sm:block h-10 w-auto"
            />
            <img 
              src={logoMonogram} 
              alt="LakeCity" 
              className="sm:hidden h-12 w-12"
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
                  <Label htmlFor="login-stand">Stand Number</Label>
                  <Input
                    id="login-stand"
                    type="text"
                    placeholder="e.g., A123"
                    value={loginStandNumber}
                    onChange={(e) => {
                      setLoginStandNumber(e.target.value);
                      setErrors({ ...errors, loginStandNumber: '' });
                    }}
                    required
                    className={errors.loginStandNumber ? 'border-destructive' : ''}
                  />
                  {errors.loginStandNumber && (
                    <p className="text-sm text-destructive">{errors.loginStandNumber}</p>
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
