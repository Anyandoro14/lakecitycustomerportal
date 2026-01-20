import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Key, Copy, Check, Loader2, Shield } from "lucide-react";

interface TwoFABypassDialogProps {
  phoneNumber: string;
  standNumber: string;
  customerName?: string;
}

const TwoFABypassDialog = ({ phoneNumber, standNumber, customerName }: TwoFABypassDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bypassCode, setBypassCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-2fa-bypass', {
        body: { phoneNumber, standNumber, customerName }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setBypassCode(data.bypassCode);
      toast.success("Bypass code generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate bypass code");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!bypassCode) return;
    
    try {
      await navigator.clipboard.writeText(bypassCode);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setBypassCode(null);
      setCopied(false);
    }, 300);
  };

  const maskedPhone = phoneNumber 
    ? phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-2)
    : 'Unknown';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Key className="h-4 w-4" />
          Generate 2FA Bypass
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            2FA Bypass Code
          </DialogTitle>
          <DialogDescription>
            Generate a one-time bypass code for customers who cannot receive SMS/WhatsApp verification.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Stand Number</p>
              <p className="font-medium">{standNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Phone</p>
              <p className="font-medium">{maskedPhone}</p>
            </div>
            {customerName && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Customer</p>
                <p className="font-medium">{customerName}</p>
              </div>
            )}
          </div>

          {bypassCode ? (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Bypass Code</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-primary">
                  {bypassCode}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Expires in 5 minutes
                </p>
              </div>
              
              <Button 
                variant="secondary" 
                className="w-full gap-2" 
                onClick={handleCopyCode}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Code
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Share this code with the customer to enter on their login screen.
                This action is logged for security purposes.
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Important:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>This code is valid for 5 minutes only</li>
                <li>It can only be used once</li>
                <li>This action is logged for security audit</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          {bypassCode ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerateCode} disabled={loading} className="gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4" />
                    Generate Code
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFABypassDialog;
