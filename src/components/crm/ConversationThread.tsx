import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  MessageSquare,
  Phone,
  Mail,
  ChevronDown,
  StickyNote,
  Loader2,
  CheckCircle,
  CheckCheck,
  Clock,
  AlertCircle,
  Eye,
  MoreVertical,
  Link as LinkIcon,
  UserPlus,
} from "lucide-react";
import { Conversation, Message, InternalNote } from "@/hooks/useConversations";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLookingGlass } from "@/contexts/LookingGlassContext";
import { useNavigate } from "react-router-dom";

interface ConversationThreadProps {
  conversation: Conversation | null;
  messages: Message[];
  notes: InternalNote[];
  loading: boolean;
  onSendMessage: (channel: "whatsapp" | "sms" | "email", body: string) => Promise<boolean>;
  onAddNote: (note: string) => Promise<boolean>;
  currentUserEmail?: string;
}

const channelConfig = {
  whatsapp: { icon: MessageSquare, label: "WhatsApp", color: "text-green-600" },
  sms: { icon: Phone, label: "SMS", color: "text-blue-600" },
  email: { icon: Mail, label: "Email", color: "text-purple-600" },
};

const deliveryIcons: Record<string, React.ReactNode> = {
  queued: <Clock className="h-3 w-3 text-muted-foreground" />,
  sent: <CheckCircle className="h-3 w-3 text-muted-foreground" />,
  delivered: <CheckCheck className="h-3 w-3 text-green-600" />,
  read: <CheckCheck className="h-3 w-3 text-blue-600" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
};

export default function ConversationThread({
  conversation,
  messages,
  notes,
  loading,
  onSendMessage,
  onAddNote,
  currentUserEmail,
}: ConversationThreadProps) {
  const navigate = useNavigate();
  const { enterLookingGlass } = useLookingGlass();
  const [messageBody, setMessageBody] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [sending, setSending] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!messageBody.trim()) return;

    setSending(true);
    const success = await onSendMessage(selectedChannel, messageBody.trim());
    if (success) {
      setMessageBody("");
    }
    setSending(false);
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;

    setAddingNote(true);
    const success = await onAddNote(noteBody.trim());
    if (success) {
      setNoteBody("");
      setShowNoteInput(false);
    }
    setAddingNote(false);
  };

  const handleViewAsCustomer = async () => {
    if (!conversation?.stand_number) return;

    const success = await enterLookingGlass(
      {
        standNumber: conversation.stand_number,
        customerName: conversation.customer_name || "",
        customerEmail: conversation.primary_email || "",
        userId: "", // Will be resolved by Looking Glass context
      },
      currentUserEmail || ""
    );
    if (success) {
      navigate("/looking-glass");
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select a conversation</p>
          <p className="text-sm">Choose from the list to view messages</p>
        </div>
      </div>
    );
  }

  // Merge messages and notes into timeline
  const timeline: Array<{ type: "message" | "note"; data: Message | InternalNote; timestamp: string }> = [
    ...messages.map((m) => ({
      type: "message" as const,
      data: m,
      timestamp: m.sent_at || m.received_at || m.created_at,
    })),
    ...notes.map((n) => ({
      type: "note" as const,
      data: n,
      timestamp: n.created_at,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="flex-1 flex flex-col bg-card">
      {/* Thread Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">
              {conversation.stand_number ? `Stand ${conversation.stand_number}` : "Unmatched Contact"}
            </h3>
            {!conversation.stand_number && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Needs Linking
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {conversation.customer_name || conversation.primary_phone || conversation.primary_email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {conversation.stand_number && (
            <Button variant="outline" size="sm" onClick={handleViewAsCustomer}>
              <Eye className="h-4 w-4 mr-2" />
              View as Customer
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowNoteInput(true)}>
                <StickyNote className="h-4 w-4 mr-2" />
                Add Internal Note
              </DropdownMenuItem>
              {!conversation.stand_number && (
                <DropdownMenuItem>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Link to Stand Number
                </DropdownMenuItem>
              )}
              <DropdownMenuItem>
                <UserPlus className="h-4 w-4 mr-2" />
                Create Support Ticket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : timeline.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((item) => {
              if (item.type === "note") {
                const note = item.data as InternalNote;
                return (
                  <div key={note.id} className="flex justify-center">
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 max-w-md">
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 mb-1">
                        <StickyNote className="h-3 w-3" />
                        <span>Internal Note by {note.created_by_email}</span>
                      </div>
                      <p className="text-sm">{note.note}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(note.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              }

              const message = item.data as Message;
              const isOutbound = message.direction === "outbound";
              const ChannelIcon = channelConfig[message.channel].icon;

              return (
                <div
                  key={message.id}
                  className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-4 py-2",
                      isOutbound
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ChannelIcon className={cn("h-3 w-3", !isOutbound && channelConfig[message.channel].color)} />
                      <span className="text-xs opacity-70">
                        {isOutbound ? "Sent" : "Received"} via {channelConfig[message.channel].label}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs opacity-70">
                        {format(new Date(message.sent_at || message.received_at || message.created_at), "h:mm a")}
                      </span>
                      {isOutbound && deliveryIcons[message.delivery_status]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Note Input */}
      {showNoteInput && (
        <div className="p-4 border-t bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Internal Note (not visible to customer)</span>
          </div>
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a private note..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              className="min-h-[60px] bg-background"
            />
            <div className="flex flex-col gap-1">
              <Button size="sm" onClick={handleAddNote} disabled={!noteBody.trim() || addingNote}>
                {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNoteInput(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-muted-foreground">Send via:</span>
          <Select value={selectedChannel} onValueChange={(v) => setSelectedChannel(v as typeof selectedChannel)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  WhatsApp
                </div>
              </SelectItem>
              <SelectItem value="sms">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-blue-600" />
                  SMS
                </div>
              </SelectItem>
              <SelectItem value="email">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-purple-600" />
                  Email
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground">
            To: {selectedChannel === "email" ? conversation.primary_email : conversation.primary_phone}
          </span>
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message..."
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="min-h-[60px] resize-none"
          />
          <Button onClick={handleSend} disabled={!messageBody.trim() || sending} className="h-auto">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
