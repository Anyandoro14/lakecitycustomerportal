import { Download, Inbox, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { PlaceholderTag } from "@/components/Placeholder";
import { StaffGate } from "@/components/StaffGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { renderEmailHtml } from "@/emails/templates";
import { backend, type Lead, type OutboxEmailRecord, type Stand } from "@/lib/backend";
import { downloadPdf } from "@/lib/pdf/builder";
import { offerPdf, paymentSchedulePdf } from "@/lib/pdf/documents";
import { cn } from "@/lib/utils";

export default function Outbox() {
  return <StaffGate>{() => <OutboxView />}</StaffGate>;
}

function OutboxView() {
  const [emails, setEmails] = useState<OutboxEmailRecord[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stands, setStands] = useState<Stand[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    Promise.all([backend.listOutbox(), backend.listLeads(), backend.listStands()]).then(([e, l, s]) => {
      setEmails(e);
      setLeads(l);
      setStands(s);
      setSelected((cur) => cur ?? e[0]?.id ?? null);
    });
  }, []);

  const current = emails?.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    if (!current) return;
    renderEmailHtml(current.template, current.props).then(setHtml);
  }, [current]);

  async function downloadAttachment(email: OutboxEmailRecord, name: string) {
    const lead = leads.find((l) => l.id === email.leadId);
    const stand = stands.find((s) => s.standNumber === lead?.standNumber);
    if (!lead || !stand) return;
    const bytes = name.startsWith("offer") ? await offerPdf(lead, stand) : await paymentSchedulePdf(lead, stand);
    downloadPdf(bytes, name);
  }

  return (
    <div className="container space-y-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-semibold">Email outbox</h1>
        <Badge variant="secondary">OUTBOX · NOT SENT (OI-TBC-20)</Badge>
      </div>
      <Alert className="border-dashed border-gold bg-accent/40">
        <AlertTitle>Nothing here has been sent</AlertTitle>
        <AlertDescription>
          Automated emails are approved and are triggered by each stage, rendered on the LakeCity standard template (v4). They
          stay in this outbox until an email provider is configured (OI-TBC-20). <PlaceholderTag>All copy PLACEHOLDER</PlaceholderTag>
        </AlertDescription>
      </Alert>

      {emails && emails.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p>No emails queued yet. Choose a stand and submit an offer to trigger the first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <ul className="space-y-2">
            {(emails ?? []).map((e) => {
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e.id)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition hover:bg-muted/60",
                      selected === e.id && "border-primary bg-secondary",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">Automated · {e.template}</span>
                      <span className="text-[10px] text-muted-foreground">{e.createdAt.slice(11, 19)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug">{e.subject}</p>
                    <p className="text-xs text-muted-foreground">To: {e.to}</p>
                    {e.attachmentNames.length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" /> {e.attachmentNames.join(", ")}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {current && (
            <Card className="overflow-hidden">
              <div className="space-y-1 border-b bg-muted/40 p-4 text-sm">
                <p><span className="text-muted-foreground">Subject:</span> <strong>{current.subject}</strong></p>
                <p><span className="text-muted-foreground">To:</span> {current.to} · <span className="text-muted-foreground">Status:</span> {current.status}</p>
                {current.attachmentNames.map((a) => (
                  <Button key={a} size="sm" variant="outline" className="mr-2 mt-1" onClick={() => downloadAttachment(current, a)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> {a}
                  </Button>
                ))}
              </div>
              <iframe title="Email preview" srcDoc={html} className="h-[900px] w-full bg-[#f3f5f4]" sandbox="" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
