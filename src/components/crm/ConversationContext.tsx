import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  DollarSign,
  Tag,
  Link as LinkIcon,
  Ticket,
  History,
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Conversation } from "@/hooks/useConversations";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface InternalUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface ConversationContextProps {
  conversation: Conversation | null;
  onUpdateStatus: (status: Conversation["status"]) => Promise<boolean>;
  onAssign: (userId: string | null) => Promise<boolean>;
  onLinkToStand: (standNumber: string) => Promise<boolean>;
}

const statusOptions = [
  { value: "open", label: "Open", color: "bg-green-100 text-green-800" },
  { value: "pending_customer", label: "Pending Customer", color: "bg-yellow-100 text-yellow-800" },
  { value: "pending_internal", label: "Pending Internal", color: "bg-blue-100 text-blue-800" },
  { value: "closed", label: "Closed", color: "bg-gray-100 text-gray-800" },
];

export default function ConversationContext({
  conversation,
  onUpdateStatus,
  onAssign,
  onLinkToStand,
}: ConversationContextProps) {
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [standInput, setStandInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Load internal users for assignment dropdown
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const { data, error } = await supabase.functions.invoke("internal-portal-access", {
          body: { action: "list-internal-users" },
        });
        if (!error && data?.users) {
          setInternalUsers(data.users);
        }
      } catch (err) {
        console.error("Failed to load internal users:", err);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const handleStatusChange = async (status: string) => {
    if (!conversation) return;
    setUpdatingStatus(true);
    await onUpdateStatus(status as Conversation["status"]);
    setUpdatingStatus(false);
  };

  const handleAssignChange = async (userId: string) => {
    if (!conversation) return;
    setAssigning(true);
    await onAssign(userId === "unassigned" ? null : userId);
    setAssigning(false);
  };

  const handleLinkToStand = async () => {
    if (!standInput.trim()) return;
    setLinking(true);
    const success = await onLinkToStand(standInput.trim().toUpperCase());
    if (success) {
      setLinkDialogOpen(false);
      setStandInput("");
    }
    setLinking(false);
  };

  if (!conversation) {
    return (
      <div className="w-80 border-l bg-card p-4 hidden lg:block">
        <div className="h-full flex items-center justify-center text-muted-foreground text-center">
          <div>
            <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select a conversation to view details</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-80 border-l bg-card hidden lg:flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Customer Identity */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer
              </h3>

              {conversation.stand_number ? (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Stand {conversation.stand_number}</span>
                    </div>
                    {conversation.customer_name && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{conversation.customer_name}</span>
                      </div>
                    )}
                    {conversation.primary_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{conversation.primary_phone}</span>
                      </div>
                    )}
                    {conversation.primary_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm truncate">{conversation.primary_email}</span>
                      </div>
                    )}
                    {conversation.customer_category && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline">{conversation.customer_category}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="font-medium text-amber-700 dark:text-amber-300">Unmatched Contact</span>
                    </div>
                    {conversation.primary_phone && (
                      <p className="text-sm mb-1">Phone: {conversation.primary_phone}</p>
                    )}
                    {conversation.primary_email && (
                      <p className="text-sm mb-3 truncate">Email: {conversation.primary_email}</p>
                    )}
                    <Button size="sm" onClick={() => setLinkDialogOpen(true)} className="w-full">
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Link to Stand Number
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            <Separator />

            {/* Status & Assignment */}
            <div>
              <h3 className="font-semibold mb-3">Status & Assignment</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
                  <Select
                    value={conversation.status}
                    onValueChange={handleStatusChange}
                    disabled={updatingStatus}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full", opt.color.split(" ")[0])} />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Assigned To</Label>
                  <Select
                    value={conversation.assigned_to_user_id || "unassigned"}
                    onValueChange={handleAssignChange}
                    disabled={assigning || loadingUsers}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {internalUsers.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Linked Tickets */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Linked Tickets
              </h3>
              <p className="text-sm text-muted-foreground">No tickets linked</p>
              <Button variant="outline" size="sm" className="w-full mt-2">
                <UserPlus className="h-4 w-4 mr-2" />
                Create Ticket
              </Button>
            </div>

            <Separator />

            {/* Activity */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <History className="h-4 w-4" />
                Activity
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Created</span>
                  <span>{format(new Date(conversation.created_at), "MMM d, yyyy")}</span>
                </div>
                {conversation.last_message_at && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Last Message</span>
                    <span>{format(new Date(conversation.last_message_at), "MMM d, h:mm a")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Link to Stand Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Contact to Stand Number</DialogTitle>
            <DialogDescription>
              This will permanently associate this contact with a stand number. All future messages from this contact will be linked to this stand.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Contact Information</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {conversation.primary_phone && `Phone: ${conversation.primary_phone}`}
                {conversation.primary_phone && conversation.primary_email && " • "}
                {conversation.primary_email && `Email: ${conversation.primary_email}`}
              </p>
            </div>
            <div>
              <Label htmlFor="stand-number">Stand Number</Label>
              <Input
                id="stand-number"
                placeholder="e.g., A123"
                value={standInput}
                onChange={(e) => setStandInput(e.target.value.toUpperCase())}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkToStand} disabled={!standInput.trim() || linking}>
              {linking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Link Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
