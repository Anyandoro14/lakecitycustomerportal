import { useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone, Send, Loader2, CheckCircle2, Eye, Edit3 } from "lucide-react";
import EmailPreview from "@/components/EmailPreview";

interface CustomerInviteDialogProps {
  // Controlled mode
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Uncontrolled mode with trigger
  trigger?: ReactNode;
  // Customer data - can be passed as object or individual props
  customer?: {
    stand_number: string;
    full_name: string;
    email: string;
    phone_number: string;
  };
  // Alternative: individual props (for convenience)
  standNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

const CustomerInviteDialog = ({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange, 
  trigger,
  customer: customerProp,
  standNumber,
  customerName,
  customerEmail,
  customerPhone
}: CustomerInviteDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled ? controlledOnOpenChange : setInternalOpen;

  // Merge customer data from props
  const customer = customerProp || (standNumber ? {
    stand_number: standNumber,
    full_name: customerName || '',
    email: customerEmail || '',
    phone_number: customerPhone || ''
  } : undefined);

  const defaultMessages = {
    email: `Dear ${customer?.full_name || 'Customer'},\n\nWelcome to the LakeCity Customer Portal! We're excited to invite you to access your personal account for Stand ${customer?.stand_number || ''}.\n\nClick the link below to create your account and view:\n✓ Payment history and statements\n✓ Agreement of Sale documents\n✓ Real-time account balance\n\nAt LakeCity, we believe in Transparency, Integrity, and Honesty.\n\nWarm regards,\nThe LakeCity Team`,
    sms: `LakeCity Portal: Welcome ${customer?.full_name || 'Customer'}! Create your account to view Stand ${customer?.stand_number || ''} payments & documents.`,
    whatsapp: `*Welcome to LakeCity Customer Portal!*\n\nDear ${customer?.full_name || 'Customer'},\n\nYour personal portal for *Stand ${customer?.stand_number || ''}* is ready!\n\n✅ View payment history\n✅ Download statements\n✅ Access Agreement of Sale\n\n🤝 *Honesty • Integrity • Transparency*\nLakeCity Development`
  };

  const handleSend = async () => {
    if (!customer) return;

    if ((channel === "sms" || channel === "whatsapp") && !customer.phone_number) {
      toast.error("Phone number required for SMS/WhatsApp invitations");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-customer-invitation', {
        body: {
          standNumber: customer.stand_number,
          customerEmail: customer.email,
          customerPhone: customer.phone_number,
          customerName: customer.full_name,
          channel: channel,
          customMessage: customMessage || undefined
        }
      });

      if (error) {
        let message = error.message || 'Failed to send invitation';
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            message = body?.hint || body?.error || message;
          }
        } catch {
          // ignore parsing errors
        }
        throw new Error(message);
      }

      if (data?.success) {
        setSent(true);
        toast.success(`Invitation sent via ${channel.toUpperCase()}`);
        setTimeout(() => {
          onOpenChange?.(false);
          setSent(false);
          setCustomMessage("");
        }, 2000);
      } else {
        throw new Error(data?.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Send invitation error:', error);
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const getChannelIcon = () => {
    switch (channel) {
      case "email": return <Mail className="h-4 w-4" />;
      case "sms": return <Phone className="h-4 w-4" />;
      case "whatsapp": return <MessageSquare className="h-4 w-4" />;
    }
  };

  const dialogContent = sent ? (
    <DialogContent className="sm:max-w-md">
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold">Invitation Sent!</h3>
        <p className="text-sm text-muted-foreground text-center">
          {customer?.full_name} has been invited via {channel.toUpperCase()}
        </p>
      </div>
    </DialogContent>
  ) : (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Send Portal Invitation
        </DialogTitle>
        <DialogDescription>
          Invite {customer?.full_name || 'customer'} to access their account on the LakeCity Customer Portal
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Customer Info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stand Number:</span>
            <span className="font-medium">{customer?.stand_number}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name:</span>
            <span className="font-medium">{customer?.full_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email:</span>
            <span className="font-medium">{customer?.email}</span>
          </div>
          {customer?.phone_number && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone:</span>
              <span className="font-medium">{customer?.phone_number}</span>
            </div>
          )}
        </div>

        {/* Channel Selection */}
        <div className="space-y-2">
          <Label>Send via</Label>
          <Select value={channel} onValueChange={(v) => {
            setChannel(v as any);
            setActiveTab("compose");
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </div>
              </SelectItem>
              <SelectItem value="sms" disabled={!customer?.phone_number}>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  SMS {!customer?.phone_number && "(No phone)"}
                </div>
              </SelectItem>
              <SelectItem value="whatsapp" disabled={!customer?.phone_number}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp {!customer?.phone_number && "(No phone)"}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs for Compose / Preview (Email only) */}
        {channel === "email" ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="compose" className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Compose
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview Email
              </TabsTrigger>
            </TabsList>
            <TabsContent value="compose" className="mt-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Message (SMS/WhatsApp only)</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setCustomMessage("")}
                    className="text-xs"
                  >
                    Reset to default
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4" />
                    <span className="font-medium text-foreground">Email uses a branded HTML template</span>
                  </p>
                  <p>
                    The email invitation uses the official LakeCity branded template with your customer's name and signup link. 
                    Switch to the "Preview Email" tab to see exactly how it will appear to the customer.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Note: The signup link will be automatically included in the email.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              <EmailPreview 
                firstName={customer?.full_name?.split(' ')[0] || 'Valued Customer'}
                signupUrl="https://lakecity.standledger.io/signup"
              />
              <p className="text-xs text-muted-foreground mt-3 text-center">
                This is how the email will appear to {customer?.full_name || 'the customer'}
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          /* Message Preview / Edit for SMS/WhatsApp */
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Message</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCustomMessage("")}
                className="text-xs"
              >
                Reset to default
              </Button>
            </div>
            <Textarea
              value={customMessage || defaultMessages[channel]}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="min-h-[200px] text-sm"
              placeholder="Customize your invitation message..."
            />
            <p className="text-xs text-muted-foreground">
              Note: The signup link will be automatically added to the message.
            </p>
          </div>
        )}
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={() => onOpenChange?.(false)} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button 
          onClick={handleSend} 
          disabled={sending}
          className="w-full sm:w-auto"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              {getChannelIcon()}
              <span className="ml-2">Send Invitation</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {dialogContent}
    </Dialog>
  );
};

export default CustomerInviteDialog;
