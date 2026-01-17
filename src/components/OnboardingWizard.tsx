import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Home, 
  FileText, 
  Receipt, 
  HelpCircle, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Shield,
  Heart,
  Eye
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  link?: string;
  linkText?: string;
  content: React.ReactNode;
}

interface OnboardingWizardProps {
  onComplete: () => void;
  customerName?: string;
}

const OnboardingWizard = ({ onComplete, customerName }: OnboardingWizardProps) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to LakeCity!",
      description: "Your personal customer portal is ready",
      icon: <Sparkles className="h-8 w-8 text-primary" />,
      content: (
        <div className="space-y-6 text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">
              Welcome{customerName ? `, ${customerName}` : ''}! 🎉
            </h3>
            <p className="text-muted-foreground">
              We're excited to have you on the LakeCity Customer Portal. 
              This quick tour will show you everything you need to know.
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 pt-4">
            <div className="text-center">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-xs font-medium">Transparency</p>
            </div>
            <div className="text-center">
              <Heart className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-xs font-medium">Integrity</p>
            </div>
            <div className="text-center">
              <Eye className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-xs font-medium">Honesty</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "dashboard",
      title: "Your Dashboard",
      description: "Track your payment progress at a glance",
      icon: <Home className="h-8 w-8 text-primary" />,
      link: "/",
      linkText: "Go to Dashboard",
      content: (
        <div className="space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <Home className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground text-center">Your Home Dashboard</h3>
          <p className="text-muted-foreground text-center">
            Your dashboard shows your complete account overview:
          </p>
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Current Balance</p>
                <p className="text-xs text-muted-foreground">See exactly how much you've paid and what's remaining</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Payment Progress</p>
                <p className="text-xs text-muted-foreground">Visual tracker showing how far you've come</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Next Payment Due</p>
                <p className="text-xs text-muted-foreground">Never miss a payment with clear due dates</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "statements",
      title: "Monthly Statements",
      description: "Access your payment history and statements",
      icon: <Receipt className="h-8 w-8 text-primary" />,
      link: "/monthly-statements",
      linkText: "View Statements",
      content: (
        <div className="space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <Receipt className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground text-center">Monthly Statements</h3>
          <p className="text-muted-foreground text-center">
            View detailed statements for every payment period:
          </p>
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Opening & Closing Balance</p>
                <p className="text-xs text-muted-foreground">Clear breakdown of each month's activity</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Download & Print</p>
                <p className="text-xs text-muted-foreground">Export statements for your records</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Payment Receipts</p>
                <p className="text-xs text-muted-foreground">Details of every payment received</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "documents",
      title: "Agreement of Sale",
      description: "Access your important documents securely",
      icon: <FileText className="h-8 w-8 text-primary" />,
      link: "/agreement-of-sale",
      linkText: "View Documents",
      content: (
        <div className="space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground text-center">Your Documents</h3>
          <p className="text-muted-foreground text-center">
            All your important documents in one secure place:
          </p>
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Agreement of Sale</p>
                <p className="text-xs text-muted-foreground">Download your official agreement document</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Signature Status</p>
                <p className="text-xs text-muted-foreground">Track document signing progress</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Secure Access</p>
                <p className="text-xs text-muted-foreground">Only you can access your documents</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "support",
      title: "Getting Help",
      description: "Our support team is here for you",
      icon: <HelpCircle className="h-8 w-8 text-primary" />,
      link: "/guide",
      linkText: "View Guide",
      content: (
        <div className="space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground text-center">Need Help?</h3>
          <p className="text-muted-foreground text-center">
            We're here to support you every step of the way:
          </p>
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Portal Guide</p>
                <p className="text-xs text-muted-foreground">Step-by-step instructions for every feature</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Support Requests</p>
                <p className="text-xs text-muted-foreground">Submit a ticket and we'll respond quickly</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Account Settings</p>
                <p className="text-xs text-muted-foreground">Manage your profile and preferences</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "complete",
      title: "You're All Set!",
      description: "Start exploring your portal",
      icon: <CheckCircle2 className="h-8 w-8 text-primary" />,
      content: (
        <div className="space-y-6 text-center">
          <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">
              You're Ready to Go! 🚀
            </h3>
            <p className="text-muted-foreground">
              You've completed the portal tour. Your account is fully set up and ready to use.
            </p>
          </div>
          <div className="bg-primary/5 rounded-xl p-4">
            <p className="text-sm font-medium text-foreground mb-2">Remember:</p>
            <ul className="text-xs text-muted-foreground space-y-1 text-left">
              <li>• Check your dashboard regularly for updates</li>
              <li>• Download statements for your records</li>
              <li>• Contact support if you have any questions</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    // Mark current step as completed
    if (!completedSteps.includes(steps[currentStep].id)) {
      setCompletedSteps([...completedSteps, steps[currentStep].id]);
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('customer_onboarding').upsert({
          user_id: user.id,
          completed: true,
          completed_at: new Date().toISOString(),
          steps_completed: completedSteps,
          current_step: steps.length
        }, { onConflict: 'user_id' });
      }
    } catch (error) {
      console.error('Failed to save onboarding progress:', error);
    } finally {
      setSaving(false);
      onComplete();
    }
  };

  const handleSkipLink = (link: string) => {
    // Save progress before navigating
    handleComplete();
    navigate(link);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-4 safe-area-inset-top">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-foreground/70">Getting Started</p>
            <h1 className="text-lg font-bold">LakeCity Portal</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-foreground/70">Step {currentStep + 1} of {steps.length}</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="max-w-md mx-auto">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  index < currentStep
                    ? "bg-primary text-primary-foreground"
                    : index === currentStep
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 overflow-y-auto">
        <div className="max-w-md mx-auto">
          <Card className="p-6 shadow-lg">
            {steps[currentStep].content}
            
            {/* Feature Link */}
            {steps[currentStep].link && (
              <Button
                variant="outline"
                className="w-full mt-6"
                onClick={() => handleSkipLink(steps[currentStep].link!)}
              >
                {steps[currentStep].linkText}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </Card>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="px-4 py-4 bg-card border-t border-border safe-area-inset-bottom">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          {currentStep === steps.length - 1 ? (
            <Button
              onClick={handleComplete}
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {saving ? "Saving..." : "Start Using Portal"}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
        
        {currentStep < steps.length - 1 && (
          <button
            onClick={handleComplete}
            className="w-full text-center text-sm text-muted-foreground mt-3 underline"
          >
            Skip tour & go to dashboard
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
