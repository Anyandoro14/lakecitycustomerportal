import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, MessageCircle, CheckCircle2, AlertTriangle, RefreshCw, Eye, EyeOff, XCircle } from "lucide-react";
import { standNumberSchema, verificationCodeSchema, passwordSchema, getPasswordErrors, maskPhoneNumber } from "@/lib/validation";

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 3;

type ResetStep = 'request' | 'verify' | 'success';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Step state
  const [step, setStep] = useState<ResetStep>('request');
  
  // Request step state
  const [standNumber, setStandNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  
  // Verify step state
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Resend state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleRequestReset = async (e: React.FormEvent) => {
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
      const { data, error: fnError } = await supabase.functions.invoke('request-password-reset', {
        body: { standNumber: standNumber.trim() }
      });

      if (fnError) throw fnError;

      if (data?.requiresSupport) {
        setError(data.message || "No verified phone number on file. Please contact support.");
        return;
      }

      if (data?.success && data?.phoneNumber) {
        setMaskedPhone(data.phoneNumber);
        setStep('verify');
        startCooldownTimer();
        toast({
          title: "Verification code sent",
          description: `A code has been sent to your WhatsApp at ${data.phoneNumber}`,
        });
      } else if (data?.success) {
        // Generic success message for security
        setStep('verify');
        setMaskedPhone("your registered number");
        startCooldownTimer();
      } else {
        setError(data?.error || "Failed to send verification code. Please try again.");
      }
    } catch (err: any) {
      console.error("Password reset request error:", err);
      setError("Failed to process request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || resendAttempts >= MAX_RESEND_ATTEMPTS || isResending) {
      return;
    }

    setIsResending(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke('request-password-reset', {
        body: { standNumber: standNumber.trim() }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setResendAttempts((prev) => prev + 1);
        startCooldownTimer();
        toast({
          title: "New code sent",
          description: `A new verification code has been sent via WhatsApp`,
        });
      } else {
        throw new Error(data?.error || "Failed to resend code");
      }
    } catch (err: any) {
      toast({
        title: "Unable to resend code",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const passwordErrors = getPasswordErrors(newPassword);
  const isPasswordValid = passwordErrors.length === 0;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate code
    const codeResult = verificationCodeSchema.safeParse(verificationCode);
    if (!codeResult.success) {
      setError(codeResult.error.errors[0].message);
      return;
    }

    // Validate password
    const passwordResult = passwordSchema.safeParse(newPassword);
    if (!passwordResult.success) {
      setError(passwordResult.error.errors[0].message);
      return;
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-password-reset', {
        body: { 
          standNumber: standNumber.trim(),
          code: verificationCode,
          newPassword: newPassword
        }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setStep('success');
        toast({
          title: "Password reset successful",
          description: "You can now log in with your new password.",
        });
      } else {
        setError(data?.error || "Failed to reset password. Please try again.");
      }
    } catch (err: any) {
      console.error("Password reset verification error:", err);
      setError(err.message || "Failed to verify code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setStep('request');
    setStandNumber("");
    setVerificationCode("");
    setNewPassword("");
    setConfirmPassword("");
    setMaskedPhone("");
    setError("");
    setResendAttempts(0);
    setResendCooldown(0);
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  };

  const canResend = resendCooldown === 0 && resendAttempts < MAX_RESEND_ATTEMPTS && !isResending;
  const remainingResends = MAX_RESEND_ATTEMPTS - resendAttempts;

  // Success screen
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Password Successfully Reset</CardTitle>
            <CardDescription className="text-base">
              Your password has been updated. You can now log in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/login")} className="w-full h-12 text-base">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verify step - enter code and new password
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Reset Your Password</CardTitle>
            <CardDescription>
              Enter the 6-digit code sent to {maskedPhone} via WhatsApp, then create a new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyAndReset} className="space-y-4">
              {/* Verification Code */}
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
                    setError("");
                  }}
                  maxLength={6}
                  required
                  disabled={loading}
                  className="h-12 text-lg text-center tracking-widest"
                />
              </div>

              {/* Resend Code Section */}
              <div className="text-center space-y-2 py-2 border-y">
                <p className="text-sm text-muted-foreground">
                  Didn't receive a code?
                </p>
                
                {resendAttempts >= MAX_RESEND_ATTEMPTS ? (
                  <p className="text-sm text-muted-foreground">
                    Maximum resend attempts reached. Please start over or contact support.
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

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError("");
                    }}
                    required
                    className="h-12 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPassword && (
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

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    required
                    className={`h-12 pr-10 ${confirmPassword && !passwordsMatch ? "border-destructive" : ""}`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-sm text-destructive">Passwords do not match</p>
                )}
                {confirmPassword && passwordsMatch && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Passwords match
                  </p>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 text-base" 
                disabled={loading || verificationCode.length !== 6 || !isPasswordValid || !passwordsMatch}
              >
                {loading ? "Resetting Password..." : "Reset Password"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full h-12"
                onClick={handleStartOver}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Start Over
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Request step - enter stand number
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Reset Password</CardTitle>
          <CardDescription>
            Enter your stand number to receive a password reset code via WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRequestReset} className="space-y-4">
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
                className={`h-12 ${error ? "border-destructive" : ""}`}
                disabled={loading}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            
            <Alert>
              <MessageCircle className="h-4 w-4" />
              <AlertDescription className="text-sm text-muted-foreground">
                A verification code will be sent to the WhatsApp number registered with your account. If you don't have a phone number on file, you'll be directed to contact support.
              </AlertDescription>
            </Alert>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading || !standNumber}>
              {loading ? "Sending..." : "Send Verification Code"}
            </Button>

            <Link to="/login" className="block">
              <Button variant="ghost" className="w-full h-12" type="button">
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
