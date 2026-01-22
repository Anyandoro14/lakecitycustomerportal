import { useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import ConversationList from "./ConversationList";
import ConversationThread from "./ConversationThread";
import ConversationContext from "./ConversationContext";

interface ConversationsInboxProps {
  currentUserId?: string;
  currentUserEmail?: string;
}

export default function ConversationsInbox({
  currentUserId,
  currentUserEmail,
}: ConversationsInboxProps) {
  const {
    conversations,
    loading,
    filters,
    setFilters,
    refetch,
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
    createConversation,
  } = useConversations(currentUserId);

  // Mark as read when selecting a conversation
  useEffect(() => {
    if (selectedConversation) {
      markAsRead();
    }
  }, [selectedConversation?.id]);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] bg-background rounded-lg border overflow-hidden">
      {/* Left: Conversation List */}
      <div className="w-80 flex-shrink-0">
        <ConversationList
          conversations={conversations}
          loading={loading}
          selectedId={selectedConversation?.id || null}
          onSelect={setSelectedConversation}
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={refetch}
          onCreateConversation={createConversation}
        />
      </div>

      {/* Middle: Thread View */}
      <ConversationThread
        conversation={selectedConversation}
        messages={messages}
        notes={notes}
        loading={messagesLoading}
        onSendMessage={sendMessage}
        onAddNote={addNote}
        currentUserEmail={currentUserEmail}
      />

      {/* Right: Context Panel */}
      <ConversationContext
        conversation={selectedConversation}
        onUpdateStatus={updateStatus}
        onAssign={assignConversation}
        onLinkToStand={linkToStand}
      />
    </div>
  );
}
