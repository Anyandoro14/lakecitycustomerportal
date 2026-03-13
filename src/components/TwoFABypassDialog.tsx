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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Key, Copy, Check, Loader2, Shield, Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";

interface TwoFABypassDialogProps {
  phoneNumber: string;
  standNumber: string;
  customerName?: string;
  trigger?: React.ReactNode;
}

const TwoFABypassDialog = ({ phoneNumber, standNumber, customerName, trigger }: TwoFABypassDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bypassCode, setBypassCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [durationWeeks, setDurationWeeks] = useState<string>("0"); // "0" = 5 min, "1"-"4" = weeks, "-1" = permanent
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isReusable, setIsReusable] = useState(false);

  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-2fa-bypass', {
        body: { 
          phoneNumber, 
          standNumber, 
          customerName,
          durationWeeks: parseInt(durationWeeks)
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setBypassCode(data.bypassCode);
      setExpiresAt(data.expiresAt);
      setIsReusable(data.isReusable);
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
      setExpiresAt(null);
      setIsReusable(false);
      setDurationWeeks("0");
    }, 300);
  };

  const maskedPhone = phoneNumber 
    ? phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-2)
    : 'Unknown';

  const formatExpiry = () => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    // Check if it's a permanent code (more than 5 years from now)
    const fiveYearsFromNow = new Date();
    fiveYearsFromNow.setFullYear(fiveYearsFromNow.getFullYear() + 5);
    if (date > fiveYearsFromNow) {
      return 'Permanent (never expires)';
    }
    if (isReusable) {
      return format(date, "d MMM yyyy 'at' HH:mm");
    }
    return '5 minutes from now';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Key className="h-4 w-4" />
            Generate 2FA Bypass
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            2FA Bypass Code
          </DialogTitle>
          <DialogDescription>
            Generate a bypass code for customers who cannot receive SMS verification.
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
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  {isReusable ? (
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Clock className="h-3 w-3 text-muted-foreground" />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {isReusable ? (durationWeeks === "-1" ? 'Permanent - never expires' : `Valid until ${formatExpiry()}`) : 'Expires in 5 minutes'}
                  </p>
                </div>
                {isReusable && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                    ✓ Reusable code - works for multiple logins
                  </p>
                )}
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
            <div className="space-y-4">
              {/* Duration selector */}
              <div className="space-y-2">
                <Label htmlFor="duration">Code Duration</Label>
                <Select value={durationWeeks} onValueChange={setDurationWeeks}>
                  <SelectTrigger id="duration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Quick (5 minutes, single-use)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="1">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>1 Week (reusable)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>2 Weeks (reusable)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="3">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>3 Weeks (reusable)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="4">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        <span>4 Weeks (reusable)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-500" />
                        <span>Permanent (never expires)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className={`rounded-lg p-4 text-sm border ${
                durationWeeks === "0" 
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                  : durationWeeks === "-1"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                  : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
              }`}>
                <p className="font-medium mb-1">
                  {durationWeeks === "0" ? "Quick Code:" : durationWeeks === "-1" ? "Permanent Code:" : "Long-term Code:"}
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {durationWeeks === "0" ? (
                    <>
                      <li>Valid for 5 minutes only</li>
                      <li>Can only be used once</li>
                      <li>Best for immediate assistance</li>
                    </>
                  ) : durationWeeks === "-1" ? (
                    <>
                      <li>Never expires - permanent bypass</li>
                      <li>Reusable for unlimited logins</li>
                      <li>For customers in blocked regions (e.g., Tanzania)</li>
                      <li className="text-red-600 dark:text-red-400 font-medium">⚠️ Use only when SMS delivery is permanently unavailable</li>
                    </>
                  ) : (
                    <>
                      <li>Valid for {durationWeeks} week{durationWeeks !== "1" ? "s" : ""}</li>
                      <li>Reusable for multiple logins</li>
                      <li>Best for customers with ongoing SMS issues</li>
                    </>
                  )}
                  <li>This action is logged for security audit</li>
                </ul>
              </div>
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
