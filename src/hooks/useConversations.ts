import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Conversation {
  id: string;
  stand_number: string | null;
  customer_name: string | null;
  customer_category: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  status: "open" | "pending_customer" | "pending_internal" | "closed";
  assigned_to_user_id: string | null;
  assigned_to_email?: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  last_message_channel?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  channel: "whatsapp" | "sms" | "email";
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string | null;
  received_at: string | null;
  provider_message_id: string | null;
  delivery_status: "queued" | "sent" | "delivered" | "read" | "failed";
  created_by_user_id: string | null;
  created_by_email?: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface InternalNote {
  id: string;
  conversation_id: string;
  note: string;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
}

export interface ConversationFilters {
  status?: string;
  channel?: string;
  assignedToMe?: boolean;
  unreadOnly?: boolean;
  category?: string;
  search?: string;
}

interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  filters: ConversationFilters;
  setFilters: (filters: ConversationFilters) => void;
  refetch: () => Promise<void>;
  selectedConversation: Conversation | null;
  setSelectedConversation: (conv: Conversation | null) => void;
  messages: Message[];
  messagesLoading: boolean;
  notes: InternalNote[];
  sendMessage: (channel: "whatsapp" | "sms" | "email", body: string) => Promise<boolean>;
  addNote: (note: string) => Promise<boolean>;
  updateStatus: (status: Conversation["status"]) => Promise<boolean>;
  assignConversation: (userId: string | null) => Promise<boolean>;
  linkToStand: (standNumber: string) => Promise<boolean>;
  markAsRead: () => Promise<void>;
}

export function useConversations(currentUserId?: string): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [notes, setNotes] = useState<InternalNote[]>([]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke("crm-conversations", {
        body: { action: "list", filters, currentUserId },
      });

      if (fetchError) throw fetchError;
      setConversations(data?.conversations || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load conversations";
      setError(message);
      console.error("Fetch conversations error:", err);
    } finally {
      setLoading(false);
    }
  }, [filters, currentUserId]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke("crm-conversations", {
        body: { action: "get-messages", conversationId },
      });

      if (fetchError) throw fetchError;
      setMessages(data?.messages || []);
      setNotes(data?.notes || []);
    } catch (err) {
      console.error("Fetch messages error:", err);
      toast.error("Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Load conversations on mount and when filters change
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when selected conversation changes
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    } else {
      setMessages([]);
      setNotes([]);
    }
  }, [selectedConversation, fetchMessages]);

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (selectedConversation && payload.new.conversation_id === selectedConversation.id) {
            fetchMessages(selectedConversation.id);
          }
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, fetchMessages, selectedConversation]);

  const sendMessage = async (
    channel: "whatsapp" | "sms" | "email",
    body: string
  ): Promise<boolean> => {
    if (!selectedConversation) return false;

    try {
      const { error: sendError } = await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "send-message",
          conversationId: selectedConversation.id,
          channel,
          body,
        },
      });

      if (sendError) throw sendError;
      await fetchMessages(selectedConversation.id);
      await fetchConversations();
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);
      return false;
    }
  };

  const addNote = async (note: string): Promise<boolean> => {
    if (!selectedConversation) return false;

    try {
      const { error: noteError } = await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "add-note",
          conversationId: selectedConversation.id,
          note,
        },
      });

      if (noteError) throw noteError;
      await fetchMessages(selectedConversation.id);
      toast.success("Note added");
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add note";
      toast.error(message);
      return false;
    }
  };

  const updateStatus = async (status: Conversation["status"]): Promise<boolean> => {
    if (!selectedConversation) return false;

    try {
      const { error: updateError } = await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "update-status",
          conversationId: selectedConversation.id,
          status,
        },
      });

      if (updateError) throw updateError;
      setSelectedConversation({ ...selectedConversation, status });
      await fetchConversations();
      toast.success("Status updated");
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      toast.error(message);
      return false;
    }
  };

  const assignConversation = async (userId: string | null): Promise<boolean> => {
    if (!selectedConversation) return false;

    try {
      const { error: assignError } = await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "assign",
          conversationId: selectedConversation.id,
          assignToUserId: userId,
        },
      });

      if (assignError) throw assignError;
      await fetchConversations();
      toast.success(userId ? "Conversation assigned" : "Assignment removed");
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to assign conversation";
      toast.error(message);
      return false;
    }
  };

  const linkToStand = async (standNumber: string): Promise<boolean> => {
    if (!selectedConversation) return false;

    try {
      const { error: linkError } = await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "link-to-stand",
          conversationId: selectedConversation.id,
          standNumber,
        },
      });

      if (linkError) throw linkError;
      setSelectedConversation({ ...selectedConversation, stand_number: standNumber });
      await fetchConversations();
      toast.success(`Linked to stand ${standNumber}`);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to link to stand";
      toast.error(message);
      return false;
    }
  };

  const markAsRead = async (): Promise<void> => {
    if (!selectedConversation || selectedConversation.unread_count === 0) return;

    try {
      await supabase.functions.invoke("crm-conversations", {
        body: {
          action: "mark-read",
          conversationId: selectedConversation.id,
        },
      });
      await fetchConversations();
    } catch (err) {
      console.error("Mark as read error:", err);
    }
  };

  return {
    conversations,
    loading,
    error,
    filters,
    setFilters,
    refetch: fetchConversations,
    selectedConversation,
    setSelectedConversation,
    messages,
    messagesLoading,
    notes,
    sendMessage,
    addNote,
    updateStatus,
    assignConversation,
    linkToStand,
    markAsRead,
  };
}
