import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Check, X, ArrowLeft } from "lucide-react";
import { 
  standNumberSchema,
  phoneSchema,
  passwordSchema,
  verificationCodeSchema,
  maskPhoneNumber,
  getPasswordErrors
} from "@/lib/validation";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import logoMonogram from "@/assets/logo-monogram-sea-green.svg";

type SignUpStep = 'validate' | 'register' | 'verify' | 'success';

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 3;

const SignUp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Current step
  const [step, setStep] = useState<SignUpStep>('validate');
  const [loading, setLoading] = useState(false);
  
  // Form data
  const [standNumber, setStandNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  
  // Validated data from server
  const [validatedData, setValidatedData] = useState<{
    standNumber: string;
    phoneNumber: string;
    email?: string;
  } | null>(null);
  
  // Registration result
  const [registrationData, setRegistrationData] = useState<{
    userId: string;
    email: string;
    phoneNumber: string;
    channel: string;
  } | null>(null);
  
  // Resend state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  // Password strength
  const passwordErrors = getPasswordErrors(password);
  const isPasswordValid = passwordErrors.length === 0;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkAuth();
  }, [navigate]);

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

  // Step 1: Validate stand number and phone number
  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: { [key: string]: string } = {};
    
    const standResult = standNumberSchema.safeParse(standNumber);
    if (!standResult.success) {
      newErrors.standNumber = standResult.error.errors[0].message;
    }
    
    const phoneResult = phoneSchema.safeParse(phoneNumber);
    if (!phoneResult.success) {
      newErrors.phoneNumber = phoneResult.error.errors[0].message;
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setLoading(true);
    setErrors({});

    try {
      const { data, error } = await supabase.functions.invoke('validate-signup', {
        body: { standNumber: standNumber.trim(), phoneNumber: phoneNumber.trim() }
      });

      // Handle edge function errors (including 409 for existing accounts)
      if (error) {
        // Try to parse the error context for structured response
        const errorContext = error.context;
        let errorBody: any = null;
        
        try {
          // The edge function returns JSON even on error responses
          if (errorContext && typeof errorContext.json === 'function') {
            errorBody = await errorContext.json();
          }
        } catch {
          // Ignore JSON parse errors
        }
        
        // Check if this is an "account already exists" error
        if (errorBody?.existingAccount) {
          toast({
            title: "Account already exists",
            description: "An account already exists for this stand number. Please login instead.",
            variant: "destructive",
          });
          return;
        }
        
        // Use the structured error message if available
        const errorMessage = errorBody?.error || error.message || "Verification failed";
        throw new Error(errorMessage);
      }
      
      if (!data.valid) {
        if (data.existingAccount) {
          toast({
            title: "Account already exists",
            description: "An account already exists for this stand number. Please login instead.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data.error || "Validation failed");
      }

      setValidatedData({
        standNumber: data.standNumber,
        phoneNumber: data.phoneNumber,
        email: data.email
      });
      
      // Pre-fill email if available from records
      if (data.email) {
        setEmail(data.email);
      }
      
      setStep('register');
      toast({
        title: "Verified!",
        description: "Your stand number and phone have been verified. Please create your password.",
      });
      
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

  // Step 2: Register user with password
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: { [key: string]: string } = {};
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        newErrors.email = "Please enter a valid email address";
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    if (!validatedData) {
      toast({
        title: "Error",
        description: "Please start the registration process again.",
        variant: "destructive",
      });
      setStep('validate');
      return;
    }
    
    setLoading(true);
    setErrors({});

    try {
      const { data, error } = await supabase.functions.invoke('register-user', {
        body: { 
          standNumber: validatedData.standNumber,
          phoneNumber: validatedData.phoneNumber,
          password: password,
          email: email || undefined
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || "Registration failed");
      }

      setRegistrationData({
        userId: data.userId,
        email: data.email,
        phoneNumber: data.phoneNumber,
        channel: data.channel
      });
      
      if (data.verificationSent) {
        startCooldownTimer();
        setStep('verify');
        toast({
          title: "Account created!",
          description: `Verification code sent via ${data.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${data.phoneNumber}`,
        });
      } else {
        // Verification not sent, but account created
        toast({
          title: "Account created",
          description: "Please login to your account.",
        });
        navigate("/login");
      }
      
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const codeResult = verificationCodeSchema.safeParse(verificationCode);
    if (!codeResult.success) {
      setErrors({ verificationCode: codeResult.error.errors[0].message });
      return;
    }
    
    if (!registrationData) {
      toast({
        title: "Error",
        description: "Please start the registration process again.",
        variant: "destructive",
      });
      setStep('validate');
      return;
    }
    
    setLoading(true);
    setErrors({});

    try {
      const { data, error } = await supabase.functions.invoke('verify-signup-otp', {
        body: { 
          phoneNumber: validatedData?.phoneNumber,
          code: verificationCode,
          email: registrationData.email,
          password: password
        }
      });

      if (error) throw error;
      
      if (!data.verified) {
        throw new Error(data.error || "Verification failed");
      }

      setStep('success');
      toast({
        title: "Welcome to LakeCity!",
        description: "Your account is now active.",
      });
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate("/");
      }, 2000);
      
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

  // Resend OTP
  const handleResendCode = async () => {
    if (resendCooldown > 0 || resendAttempts >= MAX_RESEND_ATTEMPTS || isResending) {
      return;
    }

    if (!validatedData || !registrationData) return;

    setIsResending(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: { phoneNumber: validatedData.phoneNumber }
      });
      
      if (error) throw error;
      
      setResendAttempts((prev) => prev + 1);
      startCooldownTimer();
      
      toast({
        title: "New code sent",
        description: `Verification code sent to ${registrationData.phoneNumber}`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to resend",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const canResend = resendCooldown === 0 && resendAttempts < MAX_RESEND_ATTEMPTS && !isResending;
  const remainingResends = MAX_RESEND_ATTEMPTS - resendAttempts;

  // Render based on step
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Welcome to LakeCity!</CardTitle>
            <CardDescription>
              Your account has been created and verified successfully.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Redirecting you to the dashboard...
            </p>
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verify Your Phone</CardTitle>
            <CardDescription>
              We've sent a 6-digit code via {registrationData?.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to {registrationData?.phoneNumber}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
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
              
              {/* Resend Section */}
              <div className="text-center space-y-2 py-2">
                <p className="text-sm text-muted-foreground">
                  Didn't receive a code?
                </p>
                
                {resendAttempts >= MAX_RESEND_ATTEMPTS ? (
                  <p className="text-sm text-muted-foreground">
                    Maximum resend attempts reached. Please contact support.
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
                          ? `Resend in ${resendCooldown}s` 
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
                {loading ? "Verifying..." : "Complete Registration"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('register');
                  setVerificationCode('');
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'register') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <img src={logoWordmark} alt="LakeCity" className="hidden sm:block h-10 w-auto" />
              <img src={logoMonogram} alt="LakeCity" className="sm:hidden h-14 w-14" />
            </div>
            <div>
              <CardTitle className="text-xl">Create Your Password</CardTitle>
              <CardDescription className="mt-2">
                Stand {validatedData?.standNumber} • {maskPhoneNumber(validatedData?.phoneNumber || '')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors({ ...errors, email: '' });
                  }}
                  className={`h-12 ${errors.email ? 'border-destructive' : ''}`}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Used for account recovery and notifications
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors({ ...errors, password: '' });
                  }}
                  required
                  className={`h-12 ${errors.password ? 'border-destructive' : ''}`}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
                
                {/* Password requirements */}
                <div className="text-xs space-y-1 mt-2">
                  <p className="text-muted-foreground font-medium">Password must have:</p>
                  <ul className="space-y-0.5">
                    {[
                      { check: password.length >= 8, label: 'At least 8 characters' },
                      { check: /[A-Z]/.test(password), label: 'One uppercase letter' },
                      { check: /[a-z]/.test(password), label: 'One lowercase letter' },
                      { check: /[0-9]/.test(password), label: 'One number' },
                      { check: /[^A-Za-z0-9]/.test(password), label: 'One special character' },
                    ].map((req, i) => (
                      <li key={i} className={`flex items-center gap-1.5 ${req.check ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {req.check ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {req.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setErrors({ ...errors, confirmPassword: '' });
                  }}
                  required
                  className={`h-12 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full h-12 text-base" disabled={loading || !isPasswordValid}>
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full h-12"
                onClick={() => {
                  setStep('validate');
                  setPassword('');
                  setConfirmPassword('');
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: validate (default)
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logoWordmark} alt="LakeCity" className="hidden sm:block h-10 w-auto" />
            <img src={logoMonogram} alt="LakeCity" className="sm:hidden h-12 w-12" />
          </div>
          <div>
            <CardTitle className="text-xl">Create Your Account</CardTitle>
            <CardDescription className="mt-1">
              Enter your stand number and registered phone number to get started
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleValidate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="standNumber">Stand Number</Label>
              <Input
                id="standNumber"
                type="text"
                placeholder="e.g., A123"
                value={standNumber}
                onChange={(e) => {
                  setStandNumber(e.target.value);
                  setErrors({ ...errors, standNumber: '' });
                }}
                required
                className={errors.standNumber ? 'border-destructive' : ''}
              />
              {errors.standNumber && (
                <p className="text-sm text-destructive">{errors.standNumber}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="+263771234567"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setErrors({ ...errors, phoneNumber: '' });
                }}
                required
                className={errors.phoneNumber ? 'border-destructive' : ''}
              />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Must match the phone number on file for your stand
              </p>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </Button>
            
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="text-primary hover:underline">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignUp;
