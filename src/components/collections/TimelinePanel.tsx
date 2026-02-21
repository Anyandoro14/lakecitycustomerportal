import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MessageSquare,
  StickyNote,
  CalendarCheck,
  HandCoins,
  Send,
  Mail,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface TimelinePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stand: any;
}

interface TimelineEntry {
  id: string;
  type: "outreach" | "note" | "commitment" | "follow_up";
  content: string;
  channel?: string;
  outreachType?: string;
  tone?: string;
  noteType?: string;
  followUpDate?: string;
  createdBy?: string;
  createdAt: string;
}

const TimelinePanel = ({ open, onOpenChange, stand }: TimelinePanelProps) => {
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [followUpDate, setFollowUpDate] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  useEffect(() => {
    if (open && stand?.standNumber) {
      fetchTimeline();
    }
  }, [open, stand?.standNumber]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("collections-ai-outreach", {
        body: { action: "get_timeline", standNumber: stand.standNumber },
      });
      if (error) throw error;

      const entries: TimelineEntry[] = [];

      (data.outreach || []).forEach((o: any) => {
        entries.push({
          id: o.id,
          type: "outreach",
          content: o.message_body,
          channel: o.channel,
          outreachType: o.outreach_type,
          tone: o.tone,
          createdBy: o.sent_by_email,
          createdAt: o.created_at,
        });
      });

      (data.notes || []).forEach((n: any) => {
        entries.push({
          id: n.id,
          type: n.note_type as any,
          content: n.content,
          noteType: n.note_type,
          followUpDate: n.follow_up_date,
          createdBy: n.created_by_email,
          createdAt: n.created_at,
        });
      });

      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTimeline(entries);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load timeline");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    try {
      const { error } = await supabase.functions.invoke("collections-ai-outreach", {
        body: {
          action: "add_note",
          standNumber: stand.standNumber,
          noteType,
          content: noteContent.trim(),
          followUpDate: followUpDate || null,
        },
      });
      if (error) throw error;
      toast.success("Note added");
      setNoteContent("");
      setFollowUpDate("");
      setShowNoteForm(false);
      fetchTimeline();
    } catch (err: any) {
      toast.error("Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  const entryIcon = (entry: TimelineEntry) => {
    if (entry.type === "outreach") {
      if (entry.channel === "whatsapp") return <MessageSquare className="h-4 w-4 text-emerald-600" />;
      if (entry.channel === "email") return <Mail className="h-4 w-4 text-blue-600" />;
      return <Phone className="h-4 w-4 text-orange-600" />;
    }
    if (entry.type === "commitment") return <HandCoins className="h-4 w-4 text-primary" />;
    if (entry.type === "follow_up") return <CalendarCheck className="h-4 w-4 text-secondary" />;
    return <StickyNote className="h-4 w-4 text-muted-foreground" />;
  };

  const entryLabel = (entry: TimelineEntry) => {
    if (entry.type === "outreach") {
      const typeLabels: Record<string, string> = {
        reminder: "Reminder",
        follow_up: "Follow-Up",
        escalation: "Escalation",
      };
      return `${typeLabels[entry.outreachType || ""] || "Message"} via ${entry.channel}`;
    }
    const noteLabels: Record<string, string> = {
      note: "Admin Note",
      commitment: "Payment Commitment",
      follow_up: "Follow-Up Scheduled",
    };
    return noteLabels[entry.noteType || "note"] || "Note";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Communication Timeline
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {stand?.standNumber} · {stand?.customerName || "Client"}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Add note button */}
          {!showNoteForm ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowNoteForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Note / Commitment
            </Button>
          ) : (
            <div className="border rounded-lg p-3 space-y-3 bg-card">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Admin Note</SelectItem>
                      <SelectItem value="commitment">Payment Commitment</SelectItem>
                      <SelectItem value="follow_up">Follow-Up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(noteType === "follow_up" || noteType === "commitment") && (
                  <div>
                    <Label className="text-xs">Follow-Up Date</Label>
                    <Input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter note, commitment details, or follow-up plan…"
                className="min-h-[80px] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={addingNote || !noteContent.trim()}
                >
                  {addingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNoteForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : timeline.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              No communications yet
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {timeline.map((entry) => (
                  <div key={entry.id} className="relative pl-10">
                    <div className="absolute left-2 top-1 rounded-full bg-card border p-1">
                      {entryIcon(entry)}
                    </div>
                    <div className="bg-card border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground">
                          {entryLabel(entry)}
                        </span>
                        {entry.type === "outreach" && entry.tone && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {entry.tone}
                          </Badge>
                        )}
                        {entry.followUpDate && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Due: {entry.followUpDate}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {entry.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                        <span>{format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}</span>
                        {entry.createdBy && (
                          <>
                            <span>·</span>
                            <span>{entry.createdBy}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TimelinePanel;
