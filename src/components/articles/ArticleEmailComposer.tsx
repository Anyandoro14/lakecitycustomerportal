import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Article } from "@/hooks/useArticles";
import { Send, Eye, Mail, Users, TestTube } from "lucide-react";

interface ArticleEmailComposerProps {
  article: Article;
  onClose: () => void;
}

const ArticleEmailComposer = ({ article, onClose }: ArticleEmailComposerProps) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState(`LakeCity Update: ${article.title}`);
  const [preheader, setPreheader] = useState(article.excerpt || "");
  const [customIntro, setCustomIntro] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [broadcastToAll, setBroadcastToAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");

  const handleSend = async (isTest = false) => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const body: any = {
        articleId: article.id,
        subject,
        preheader,
        customIntro,
        isTest,
      };

      if (isTest) {
        body.testEmail = user.email;
      } else if (broadcastToAll) {
        body.broadcastToAll = true;
      } else {
        if (!recipientEmail.trim()) {
          toast({ title: "Email required", description: "Enter a recipient email address", variant: "destructive" });
          setSending(false);
          return;
        }
        body.recipientEmail = recipientEmail.trim();
      }

      const { data, error } = await supabase.functions.invoke("send-article-email", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: isTest ? "Test email sent!" : broadcastToAll ? "Broadcast sent!" : "Email sent!",
        description: isTest
          ? `Check your inbox at ${user.email}`
          : broadcastToAll
          ? `Sent to ${data?.recipientCount || "all"} customers`
          : `Sent to ${recipientEmail}`,
      });

      if (!isTest && !broadcastToAll) {
        setRecipientEmail("");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Simple HTML preview
  const previewHtml = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <div style="background: #0B3D2E; padding: 32px; text-align: center;">
        <img src="/logo-wordmark-white.svg" alt="LakeCity" height="36" />
      </div>
      <div style="padding: 32px 28px;">
        <h1 style="color: #0B3D2E; font-size: 22px; margin: 0 0 16px;">${subject}</h1>
        ${customIntro ? `<p style="color: #374151; font-size: 15px; line-height: 1.7;">${customIntro}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
        ${article.content.split("\n\n").map(p => {
          if (p.startsWith("## ")) return `<h2 style="color: #0B3D2E; font-size: 18px;">${p.replace("## ", "")}</h2>`;
          if (p.startsWith("### ")) return `<h3 style="color: #0B3D2E; font-size: 16px;">${p.replace("### ", "")}</h3>`;
          return `<p style="color: #374151; font-size: 14px; line-height: 1.7;">${p}</p>`;
        }).join("")}
      </div>
      <div style="background: #0B3D2E; padding: 20px; text-align: center;">
        <p style="color: rgba(255,255,255,0.7); font-size: 12px; margin: 0;">LakeCity Residential Estates</p>
      </div>
    </div>
  `;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="compose" className="gap-1.5 text-xs">
            <Mail className="h-3.5 w-3.5" /> Compose
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" /> Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4 mt-4">
          <div>
            <Label className="text-xs">Subject Line</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Preview Text (shown in inbox)</Label>
            <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} className="mt-1" placeholder="Brief preview shown in email clients..." />
          </div>
          <div>
            <Label className="text-xs">Custom Introduction (optional)</Label>
            <Textarea
              value={customIntro}
              onChange={(e) => setCustomIntro(e.target.value)}
              className="mt-1 min-h-[80px] resize-none"
              placeholder="Add a personal note before the article content..."
            />
          </div>

          <div className="border border-border rounded-lg p-4 space-y-4">
            <p className="text-xs font-semibold text-foreground">Send To</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs cursor-pointer">Broadcast to all customers</Label>
              </div>
              <Switch checked={broadcastToAll} onCheckedChange={setBroadcastToAll} />
            </div>

            {!broadcastToAll && (
              <div>
                <Label className="text-xs">Recipient Email</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="mt-1"
                  placeholder="customer@example.com"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => handleSend(true)} disabled={sending} className="gap-1.5">
              <TestTube className="h-3.5 w-3.5" /> Send Test to Me
            </Button>
            <Button size="sm" onClick={() => handleSend(false)} disabled={sending} className="gap-1.5 flex-1">
              <Send className="h-3.5 w-3.5" /> {broadcastToAll ? "Broadcast to All" : "Send Email"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <div className="border border-border rounded-lg overflow-hidden bg-muted/30 p-4">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ArticleEmailComposer;
