import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, MessageCircle, Phone } from "lucide-react";
import { 
  verificationCodeSchema,
  standNumberSchema,
  maskPhoneNumber
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
  const [deliveryBlocked, setDeliveryBlocked] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [showChannelSelection, setShowChannelSelection] = useState(false);
  
  // Resend 2FA state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Login form state
  const [loginStandNumber, setLoginStandNumber] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [userEmail, setUserEmail] = useState(""); // Store email for re-auth after 2FA
  const [userStandNumber, setUserStandNumber] = useState(""); // Store stand number for syncing

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

  // Sync stand number to profile after successful auth
  const syncStandNumberToProfile = async (userId: string, standNumber: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ stand_number: standNumber })
        .eq('id', userId);
      
      if (error) {
        console.error('Failed to sync stand number to profile:', error);
      } else {
        console.log(`Synced stand number ${standNumber} to profile`);
      }
    } catch (err) {
      console.error('Error syncing stand number:', err);
    }
  };

  const sendVerificationCode = async (phone: string, channel: 'whatsapp' | 'sms' = 'whatsapp'): Promise<boolean> => {
    try {
      const { error: verifyError } = await supabase.functions.invoke('send-2fa-code', {
        body: { phoneNumber: phone, channel }
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
    
    console.log('[Login] Form submitted with stand number:', loginStandNumber, 'Length:', loginStandNumber.length);
    
    if (!validateLoginForm()) {
      console.log('[Login] Validation failed, errors:', errors);
      return;
    }
    
    console.log('[Login] Validation passed, proceeding with login...');
    setLoading(true);
    setDeliveryBlocked(false);

    try {
      console.log('[Login] Calling lookup-stand-email for:', loginStandNumber.trim());
      // Look up the user's email by stand number via edge function (bypasses RLS)
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke('lookup-stand-email', {
        body: { standNumber: loginStandNumber.trim() }
      });

      console.log('[Login] Lookup response:', { lookupData, lookupError });

      if (lookupError) throw lookupError;
      
      if (!lookupData?.found || !lookupData?.email) {
        throw new Error(lookupData?.error || "No account found for this stand number. Please check your stand number or contact support.");
      }

      // Store email and stand number for later use
      setUserEmail(lookupData.email);
      setUserStandNumber(lookupData.standNumber || loginStandNumber.trim());

      // Authenticate with the found email
      const { data, error } = await supabase.auth.signInWithPassword({
        email: lookupData.email,
        password: loginPassword,
      });

      if (error) throw error;

      if (data.user) {
        // Sync the stand number to the user's profile
        await syncStandNumberToProfile(data.user.id, lookupData.standNumber || loginStandNumber.trim());

        // Get phone number for 2FA (now we're authenticated, RLS allows it)
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.phone_number) {
          // Sign out immediately - user must complete 2FA to get a valid session
          await supabase.auth.signOut();
          
          setPendingUserId(data.user.id);
          setPhoneNumber(profile.phone_number);
          
          // Reset resend state for new login attempt
          setResendAttempts(0);
          setResendCooldown(0);
          
          // Show channel selection screen
          setShowChannelSelection(true);
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

  const handleChannelSelect = async (channel: 'whatsapp' | 'sms') => {
    setSelectedChannel(channel);
    setLoading(true);
    setDeliveryBlocked(false);

    try {
      await sendVerificationCode(phoneNumber, channel);
      
      // Start cooldown after initial send
      startCooldownTimer();
      
      setShowChannelSelection(false);
      setShowVerification(true);
      
      toast({
        title: "Verification code sent",
        description: `We've sent a 6-digit code via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${maskPhoneNumber(phoneNumber)}`,
      });
    } catch (err: any) {
      console.warn('[Login] 2FA delivery failed; allowing bypass entry:', err);
      setDeliveryBlocked(true);
      setShowChannelSelection(false);
      setShowVerification(true);
      
      toast({
        title: "Verification code delivery unavailable",
        description: `We couldn't deliver a code to ${maskPhoneNumber(phoneNumber)}. If support provided you a bypass code, enter it below to continue.`,
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
      await sendVerificationCode(phoneNumber, selectedChannel);
      
      setResendAttempts((prev) => prev + 1);
      startCooldownTimer();
      
      toast({
        title: "New code sent",
        description: `A new verification code has been sent to ${maskPhoneNumber(phoneNumber)}`,
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
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: loginPassword,
        });
        
        if (signInError) throw signInError;

        // Sync stand number after 2FA re-auth
        if (authData.user && userStandNumber) {
          await syncStandNumberToProfile(authData.user.id, userStandNumber);
        }
        
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
    setShowChannelSelection(false);
    setVerificationCode("");
    setPendingUserId(null);
    setPhoneNumber("");
    setDeliveryBlocked(false);
    setResendAttempts(0);
    setResendCooldown(0);
    setSelectedChannel('whatsapp');
  };

  const maskedPhone = maskPhoneNumber(phoneNumber);
  const canResend = resendCooldown === 0 && resendAttempts < MAX_RESEND_ATTEMPTS && !isResending;
  const remainingResends = MAX_RESEND_ATTEMPTS - resendAttempts;

  // Channel selection screen
  if (showChannelSelection) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">Choose Verification Method</CardTitle>
            <CardDescription>
              How would you like to receive your verification code?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              We'll send a 6-digit code to {maskedPhone}
            </p>
            
            <div className="grid gap-3">
              <Button
                variant="outline"
                className="h-16 flex items-center justify-start gap-4 px-4"
                onClick={() => handleChannelSelect('whatsapp')}
                disabled={loading}
              >
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-medium">WhatsApp</div>
                  <div className="text-sm text-muted-foreground">Receive code via WhatsApp message</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="h-16 flex items-center justify-start gap-4 px-4"
                onClick={() => handleChannelSelect('sms')}
                disabled={loading}
              >
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-medium">SMS</div>
                  <div className="text-sm text-muted-foreground">Receive code via text message</div>
                </div>
              </Button>
            </div>
            
            {loading && (
              <p className="text-sm text-muted-foreground text-center">Sending code...</p>
            )}
            
            <Button
              type="button"
              variant="ghost"
              className="w-full h-12"
              onClick={handleBackToLogin}
              disabled={loading}
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">Verification</CardTitle>
            <CardDescription>
              {deliveryBlocked
                ? `We couldn't deliver a code to ${maskedPhone}. If you have a bypass code from support, enter it below.`
                : `We've sent a 6-digit verification code to ${maskedPhone}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setErrors({ ...errors, verificationCode: '' });
                  }}
                  maxLength={6}
                  required
                  className={`h-12 text-lg text-center tracking-widest ${errors.verificationCode ? 'border-destructive' : ''}`}
                />
                {errors.verificationCode && (
                  <p className="text-sm text-destructive">{errors.verificationCode}</p>
                )}
              </div>
              
              {/* Resend Code Section */}
              <div className="text-center space-y-2 py-3">
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
                      onClick={handleResendCode}
                      disabled={!canResend}
                      className="gap-2 h-10"
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
              
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full h-12"
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
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
              className="sm:hidden h-14 w-14"
            />
          </div>
          <div>
            <CardTitle className="text-xl">Sign in to your LakeCity account</CardTitle>
            <CardDescription className="mt-2">Access your stand details, payments, and documents</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
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
                className={`h-12 ${errors.loginStandNumber ? 'border-destructive' : ''}`}
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
                className={`h-12 ${errors.loginPassword ? 'border-destructive' : ''}`}
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
            
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>
            
            <div className="text-center text-sm py-2">
              <span className="text-muted-foreground">Don't have an account? </span>
              <Link to="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;