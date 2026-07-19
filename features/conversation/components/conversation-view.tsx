"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createBranchFromMessage,
  deleteBranch,
  switchBranch,
} from "@/features/conversation/actions/branch-actions";
import { useConversations } from "../hooks/use-conversation";
import { queryKeys } from "../utils/query-keys";
import { BranchSwitcher } from "./branch-switcher";
import { ChatEmpty } from "./chat-empty";
import { ChatMessages } from "./chat-messages";
import { ChatComposer } from "./chat-composer";

type ConversationViewProps = {
  conversationId: string;
  activeBranchId: string | null;
  initialMessages: UIMessage[];
};

/**
 * Main chat view — header, message list (or empty state), and composer with streaming.
 *
 * Keeps a client copy of the active branch + path so create/switch/delete can
 * update the message list immediately (without waiting on a flaky RSC refresh).
 */
export const ConversationView = ({
  conversationId,
  activeBranchId: serverBranchId,
  initialMessages,
}: ConversationViewProps) => {
  const queryClient = useQueryClient();
  const { data: conversations } = useConversations();

  const [branchId, setBranchId] = useState(serverBranchId);
  const [pathMessages, setPathMessages] = useState(initialMessages);
  const previousServerBranchId = useRef(serverBranchId);

  // Sync from RSC when the server active branch changes (e.g. hard navigation).
  useEffect(() => {
    if (previousServerBranchId.current === serverBranchId) {
      return;
    }
    previousServerBranchId.current = serverBranchId;
    setBranchId(serverBranchId);
    setPathMessages(initialMessages);
  }, [serverBranchId, initialMessages]);

  const chatId = branchId
    ? `${conversationId}:${branchId}`
    : conversationId;

  const title =
    conversations?.find((item) => item.id === conversationId)?.title ??
    "Chat";

  return (
    <ConversationChat
      key={chatId}
      chatId={chatId}
      conversationId={conversationId}
      activeBranchId={branchId}
      initialMessages={pathMessages}
      title={title}
      onBranchApplied={(nextBranchId, messages) => {
        setBranchId(nextBranchId);
        setPathMessages(messages);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.branches.byConversation(conversationId),
        });
      }}
    />
  );
};

type ConversationChatProps = {
  chatId: string;
  conversationId: string;
  activeBranchId: string | null;
  initialMessages: UIMessage[];
  title: string;
  onBranchApplied: (branchId: string, messages: UIMessage[]) => void;
};

function ConversationChat({
  chatId,
  conversationId,
  activeBranchId,
  initialMessages,
  title,
  onBranchApplied,
}: ConversationChatProps) {
  const queryClient = useQueryClient();
  const [branchPending, setBranchPending] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            id: conversationId,
            message: messages.at(-1),
          },
        }),
      }),
    [conversationId]
  );

  const { messages, sendMessage, status } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.branches.byConversation(conversationId),
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // `key={chatId}` remounts this component per branch, so useChat already
  // seeds from initialMessages — no extra effect needed.
  const visibleMessages =
    messages.length > 0 ? messages : initialMessages;

  async function handleBranchFromMessage(messageId: string) {
    setBranchPending(true);
    try {
      const result = await createBranchFromMessage(conversationId, messageId);
      const forkIndex = visibleMessages.findIndex(
        (message) => message.id === messageId
      );
      const fallbackPath =
        forkIndex >= 0 ? visibleMessages.slice(0, forkIndex + 1) : visibleMessages;
      const nextMessages =
        result.messages.length > 0 ? result.messages : fallbackPath;

      onBranchApplied(result.branch.id, nextMessages);
      toast.success("Branch created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create branch"
      );
    } finally {
      setBranchPending(false);
    }
  }

  async function handleSwitchBranch(nextBranchId: string) {
    setBranchPending(true);
    try {
      const result = await switchBranch(conversationId, nextBranchId);
      onBranchApplied(result.branch.id, result.messages);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not switch branch"
      );
    } finally {
      setBranchPending(false);
    }
  }

  async function handleDeleteBranch(nextBranchId: string) {
    setBranchPending(true);
    try {
      const result = await deleteBranch(nextBranchId);
      if (result.activeBranchId) {
        onBranchApplied(result.activeBranchId, result.messages);
      }
      toast.success("Branch deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete branch"
      );
    } finally {
      setBranchPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
        <BranchSwitcher
          conversationId={conversationId}
          activeBranchId={activeBranchId}
          disabled={branchPending || status !== "ready"}
          onSwitchBranch={handleSwitchBranch}
          onDeleteBranch={handleDeleteBranch}
        />
      </header>

      {visibleMessages.length === 0 ? (
        <ChatEmpty />
      ) : (
        <ChatMessages
          messages={visibleMessages}
          status={status}
          branchDisabled={branchPending || status !== "ready"}
          onBranchFromMessage={handleBranchFromMessage}
        />
      )}

      <ChatComposer
        onSend={(text) => {
          void sendMessage({ text });
        }}
        isSending={status !== "ready" || branchPending}
        autoFocus
      />
    </div>
  );
}
