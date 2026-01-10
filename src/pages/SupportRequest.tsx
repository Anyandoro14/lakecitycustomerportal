import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, CheckCircle2, Send, Loader2, MessageCircle } from "lucide-react";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

const issueTypes = [
  { value: "monthly_payment", label: "Monthly Payment" },
  { value: "balance", label: "Balance" },
  { value: "statement", label: "Statement" },
  { value: "agreement_of_sale", label: "Agreement of Sale" },
  { value: "tech_support", label: "Tech Support" },
  { value: "feature_request", label: "Feature Request" },
];

const subIssues: Record<string, { value: string; label: string }[]> = {
  monthly_payment: [
    { value: "payment_not_recorded", label: "I don't see my monthly payment recorded" },
    { value: "payment_not_reflected", label: "My payment was made but not reflected" },
    { value: "unsure_amount", label: "I am unsure how much I need to pay this month" },
  ],
  balance: [
    { value: "balance_incorrect", label: "My balance appears incorrect" },
    { value: "balance_not_updated", label: "My balance did not update after payment" },
    { value: "balance_clarification", label: "I need clarification on my outstanding balance" },
  ],
  statement: [
    { value: "download_help", label: "I don't know how to download my statement" },
    { value: "missing_payments", label: "My statement is missing payments" },
    { value: "statement_mismatch", label: "My statement does not match my balance" },
  ],
  agreement_of_sale: [
    { value: "cannot_find", label: "I can't find my Agreement of Sale" },
    { value: "details_incorrect", label: "My Agreement of Sale details are incorrect" },
    { value: "signing_status", label: "I am unsure if my Agreement has been signed" },
  ],
  tech_support: [
    { value: "cannot_login", label: "I cannot log in" },
    { value: "portal_not_loading", label: "The portal is not loading" },
    { value: "seeing_error", label: "I am seeing an error" },
  ],
  feature_request: [
    { value: "new_feature", label: "I would like a new feature" },
    { value: "suggestion", label: "I have a suggestion" },
  ],
};

const SupportRequest = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [caseNumber, setCaseNumber] = useState("");
  
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [issueType, setIssueType] = useState("");
  const [subIssue, setSubIssue] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useSessionTimeout();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/login");
        return;
      }

      // Get user email
      setEmail(user.email || "");

      // Get profile data for full name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.full_name) {
        const nameParts = profile.full_name.split(' ');
        setFirstName(nameParts[0] || "");
        setLastName(nameParts.slice(1).join(' ') || "");
      }
      
      if (profile?.phone_number) {
        setWhatsappNumber(profile.phone_number);
      }
    } catch (error) {
      console.error('Error loading user data');
    } finally {
      setLoading(false);
    }
  };

  const validateWhatsAppNumber = (number: string): boolean => {
    if (!number) return true; // Optional field
    // Must start with + and country code, followed by digits
    const whatsappRegex = /^\+[1-9]\d{6,14}$/;
    return whatsappRegex.test(number.replace(/\s/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};

    if (!issueType) {
      newErrors.issueType = "Please select an issue type";
    }
    if (!subIssue) {
      newErrors.subIssue = "Please select a specific issue";
    }
    if (description.length < 50) {
      newErrors.description = `Please provide at least 50 characters (${description.length}/50)`;
    }
    if (!consent) {
      newErrors.consent = "Please agree to be contacted regarding this issue";
    }
    if (whatsappNumber && !validateWhatsAppNumber(whatsappNumber)) {
      newErrors.whatsappNumber = "Please enter a valid international phone number (e.g., +263771234567)";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/login");
        return;
      }

      // Insert support case - use type assertion for user_id since it's in the table
      const { data: caseData, error: insertError } = await supabase
        .from('support_cases')
        .insert({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: email,
          whatsapp_number: whatsappNumber || null,
          issue_type: issueType,
          sub_issue: subIssue,
          description: description,
        } as any)
        .select('case_number')
        .single();

      if (insertError) throw insertError;

      // Log the support case (no automatic WhatsApp notification - customer initiates)
      console.log(`[Support Case] Created: ${caseData.case_number}`);

      setCaseNumber(caseData.case_number);
      setSubmitted(true);
      
      toast({
        title: "Support request submitted",
        description: `Your case number is ${caseData.case_number}`,
      });
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: "Please wait a moment and try again. Contact support if the issue continues.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Generate WhatsApp click-to-chat link with pre-filled message
  const generateWhatsAppLink = () => {
    const issueLabel = issueTypes.find(i => i.value === issueType)?.label || issueType;
    const message = `Hello LakeCity Support,

I've submitted a support request via the LakeCity Customer Portal.

Case Number: ${caseNumber}
Issue: ${issueLabel}

Thank you.`;
    
    // WhatsApp number without + for wa.me link
    const whatsappBusinessNumber = "263783002138";
    return `https://wa.me/${whatsappBusinessNumber}?text=${encodeURIComponent(message)}`;
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <CustomerHeader />
        <main className="max-w-md mx-auto px-4 py-8">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Request Submitted</h2>
              <p className="text-muted-foreground mb-4">
                Your support request has been logged successfully.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-muted-foreground">Your case number:</p>
                <p className="text-2xl font-bold text-primary">{caseNumber}</p>
              </div>
              
              {/* WhatsApp Chat Section */}
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-3">
                  To chat with our support team on WhatsApp, tap the button below:
                </p>
                <Button 
                  asChild
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <a 
                    href={generateWhatsAppLink()} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Message LakeCity Support on WhatsApp
                  </a>
                </Button>
                <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                  This will open WhatsApp with a pre-filled message containing your case number.
                </p>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                Alternatively, we will contact you via email regarding this issue.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => navigate("/")} className="w-full">
                  Return to Dashboard
                </Button>
                <Button variant="outline" onClick={() => navigate("/guide")} className="w-full">
                  Back to Guide
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/guide")}
          className="mb-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Guide
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Please fill out the form below and we'll get back to you as soon as possible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Read-only auto-populated fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Optional WhatsApp number */}
              <div className="space-y-2">
                <Label htmlFor="whatsapp">Phone Number (WhatsApp – optional)</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="+263771234567"
                  value={whatsappNumber}
                  onChange={(e) => {
                    setWhatsappNumber(e.target.value);
                    setErrors({ ...errors, whatsappNumber: '' });
                  }}
                  className={errors.whatsappNumber ? 'border-destructive' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  If provided, we may contact you on WhatsApp regarding this issue.
                </p>
                {errors.whatsappNumber && (
                  <p className="text-sm text-destructive">{errors.whatsappNumber}</p>
                )}
              </div>

              {/* Issue Type */}
              <div className="space-y-2">
                <Label htmlFor="issueType">Issue Type *</Label>
                <Select 
                  value={issueType} 
                  onValueChange={(value) => {
                    setIssueType(value);
                    setSubIssue(""); // Reset sub-issue when issue type changes
                    setErrors({ ...errors, issueType: '', subIssue: '' });
                  }}
                >
                  <SelectTrigger className={errors.issueType ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select an issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    {issueTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.issueType && (
                  <p className="text-sm text-destructive">{errors.issueType}</p>
                )}
              </div>

              {/* Dynamic Sub-issue */}
              {issueType && (
                <div className="space-y-2">
                  <Label htmlFor="subIssue">Specific Issue *</Label>
                  <Select 
                    value={subIssue} 
                    onValueChange={(value) => {
                      setSubIssue(value);
                      setErrors({ ...errors, subIssue: '' });
                    }}
                  >
                    <SelectTrigger className={errors.subIssue ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select a specific issue" />
                    </SelectTrigger>
                    <SelectContent>
                      {subIssues[issueType]?.map((issue) => (
                        <SelectItem key={issue.value} value={issue.value}>
                          {issue.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.subIssue && (
                    <p className="text-sm text-destructive">{errors.subIssue}</p>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description * (minimum 50 characters)</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe your issue in detail..."
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setErrors({ ...errors, description: '' });
                  }}
                  rows={4}
                  className={errors.description ? 'border-destructive' : ''}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {description.length}/50 characters minimum
                </p>
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description}</p>
                )}
              </div>

              {/* Consent checkbox */}
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(checked) => {
                      setConsent(checked as boolean);
                      setErrors({ ...errors, consent: '' });
                    }}
                    className={errors.consent ? 'border-destructive' : ''}
                  />
                  <label
                    htmlFor="consent"
                    className="text-sm leading-tight cursor-pointer"
                  >
                    I agree to be contacted via email and/or WhatsApp regarding this issue. *
                  </label>
                </div>
                {errors.consent && (
                  <p className="text-sm text-destructive">{errors.consent}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
};

export default SupportRequest;
