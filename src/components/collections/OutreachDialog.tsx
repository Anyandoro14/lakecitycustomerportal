import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Send, MessageSquare, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

interface OutreachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stand: any;
  defaultType: "reminder" | "follow_up" | "escalation";
}

const OutreachDialog = ({ open, onOpenChange, stand, defaultType }: OutreachDialogProps) => {
  const [outreachType, setOutreachType] = useState(defaultType);
  const [tone, setTone] = useState("professional");
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "email">("whatsapp");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("collections-ai-outreach", {
        body: {
          action: "generate",
          outreachType,
          tone,
          clientName: stand?.customerName,
          standNumber: stand?.standNumber,
          amountDue: stand?.currentBalance || stand?.monthlyPayment,
          daysOverdue: stand?.daysOverdue || 0,
          extensionStatus: (stand?.customerCategory || "").toLowerCase().includes("extension")
            ? "Extension"
            : "Standard",
        },
      });
      if (error) throw error;
      setMessage(data.message || "");
      toast.success("Message generated");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate message");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }
    if (!recipient.trim()) {
      toast.error("Please enter a recipient");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("collections-ai-outreach", {
        body: {
          action: "send",
          standNumber: stand?.standNumber,
          customerName: stand?.customerName,
          channel,
          message: message.trim(),
          outreachType,
          tone,
          recipient: recipient.trim(),
        },
      });
      if (error) throw error;
      toast.success(`Message sent via ${channel}`);
      onOpenChange(false);
      setMessage("");
      setRecipient("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const channelIcon = {
    sms: <Phone className="h-4 w-4" />,
    whatsapp: <MessageSquare className="h-4 w-4" />,
    email: <Mail className="h-4 w-4" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Outreach — {stand?.standNumber}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {stand?.customerName || "Client"} · {stand?.daysOverdue || 0} days overdue
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={outreachType} onValueChange={(v: any) => setOutreachType(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Reminder</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                  <SelectItem value="escalation">Escalation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gentle">Gentle</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="formal">Formal (AOS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={generating} className="w-full" variant="outline">
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {generating ? "Generating…" : "Generate AI Message"}
          </Button>

          {/* Editable message */}
          <div>
            <Label className="text-xs">Message (editable)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Generate a message above or type your own…"
              className="mt-1 min-h-[160px] font-mono text-sm"
            />
          </div>

          {/* Recipient */}
          <div>
            <Label className="text-xs">
              Recipient ({channel === "email" ? "Email" : "Phone Number"})
            </Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === "email" ? "client@example.com" : "0771234567"}
              className="mt-1"
            />
          </div>

          {/* Send */}
          <Button onClick={handleSend} disabled={sending || !message.trim()} className="w-full">
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              channelIcon[channel]
            )}
            <span className="ml-2">
              {sending ? "Sending…" : `Send via ${channel === "whatsapp" ? "WhatsApp" : channel === "sms" ? "SMS" : "Email"}`}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OutreachDialog;
