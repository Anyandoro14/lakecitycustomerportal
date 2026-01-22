import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  MessageSquare,
  Phone,
  Mail,
  Filter,
  RefreshCw,
  AlertCircle,
  User,
  Plus,
  MapPin,
} from "lucide-react";
import { Conversation, ConversationFilters } from "@/hooks/useConversations";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface CreateConversationParams {
  standNumber?: string;
  phone?: string;
  email?: string;
  customerName?: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  filters: ConversationFilters;
  onFiltersChange: (filters: ConversationFilters) => void;
  onRefresh: () => void;
  onCreateConversation: (params: CreateConversationParams) => Promise<Conversation | null>;
}

const statusColors: Record<string, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  pending_customer: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  pending_internal: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  pending_customer: "Pending Customer",
  pending_internal: "Pending Internal",
  closed: "Closed",
};

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-3 w-3 text-green-600" />,
  sms: <Phone className="h-3 w-3 text-blue-600" />,
  email: <Mail className="h-3 w-3 text-purple-600" />,
};

export default function ConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  onRefresh,
  onCreateConversation,
}: ConversationListProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newStandNumber, setNewStandNumber] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const handleCreateConversation = async () => {
    if (!newStandNumber && !newPhone && !newEmail) return;
    
    setCreating(true);
    const result = await onCreateConversation({
      standNumber: newStandNumber || undefined,
      phone: newPhone || undefined,
      email: newEmail || undefined,
      customerName: newCustomerName || undefined,
    });
    setCreating(false);

    if (result) {
      setShowNewDialog(false);
      setNewStandNumber("");
      setNewPhone("");
      setNewEmail("");
      setNewCustomerName("");
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-card">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Conversations</h2>
          <div className="flex gap-1">
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="New conversation">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start New Conversation</DialogTitle>
                  <DialogDescription>
                    Enter at least one identifier to find or create a conversation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Stand Number
                    </Label>
                    <Input
                      placeholder="e.g., 3228"
                      value={newStandNumber}
                      onChange={(e) => setNewStandNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Phone Number
                    </Label>
                    <Input
                      placeholder="e.g., +263771234567"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email Address
                    </Label>
                    <Input
                      type="email"
                      placeholder="customer@email.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Customer Name (optional)
                    </Label>
                    <Input
                      placeholder="e.g., John Doe"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateConversation}
                    disabled={creating || (!newStandNumber && !newPhone && !newEmail)}
                  >
                    {creating ? "Creating..." : "Start Conversation"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && "bg-muted")}
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by stand, name, phone..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="space-y-2 pt-2 border-t">
            <Select
              value={filters.status || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, status: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending_customer">Pending Customer</SelectItem>
                <SelectItem value="pending_internal">Pending Internal</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.channel || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, channel: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                variant={filters.assignedToMe ? "secondary" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => onFiltersChange({ ...filters, assignedToMe: !filters.assignedToMe })}
              >
                <User className="h-3 w-3 mr-1" />
                My Inbox
              </Button>
              <Button
                variant={filters.unreadOnly ? "secondary" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => onFiltersChange({ ...filters, unreadOnly: !filters.unreadOnly })}
              >
                Unread
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No conversations found</p>
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                  selectedId === conv.id && "bg-muted"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {!conv.stand_number && (
                      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="font-medium truncate">
                      {conv.stand_number ? `Stand ${conv.stand_number}` : "Unmatched Contact"}
                    </span>
                  </div>
                  {conv.unread_count > 0 && (
                    <Badge variant="destructive" className="flex-shrink-0">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground truncate mb-2">
                  {conv.customer_name || conv.primary_phone || conv.primary_email || "Unknown"}
                </p>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {conv.last_message_channel && channelIcons[conv.last_message_channel]}
                    <Badge variant="outline" className={cn("text-xs", statusColors[conv.status])}>
                      {statusLabels[conv.status]}
                    </Badge>
                  </div>
                  {conv.last_message_at && (
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>

                {conv.last_message_preview && (
                  <p className="text-xs text-muted-foreground truncate mt-2 italic">
                    {conv.last_message_preview}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
