"use client";

import {
  isTextUIPart,
  isToolUIPart,
  getToolName,
  type ChatStatus,
  type UIMessage,
} from "ai";
import {
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { cn } from "@/lib/utils";
import { WebSearchPart } from "./web-search-part";

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
  branchDisabled?: boolean;
  onBranchFromMessage: (messageId: string) => void;
};

function getMessageText(message: UIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function RoleBadge({ role }: { role: UIMessage["role"] }) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "mb-1.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-1",
        isUser
          ? "bg-primary/15 text-primary ring-primary/25"
          : "bg-muted text-muted-foreground ring-border/70"
      )}
      aria-hidden
    >
      {isUser ? (
        <UserIcon className="size-3.5" />
      ) : (
        <SparklesIcon className="size-3.5" />
      )}
    </div>
  );
}

type CopyMessageActionProps = {
  text: string;
  disabled?: boolean;
};

function CopyMessageAction({ text, disabled = false }: CopyMessageActionProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    if (!text || disabled) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Could not copy message");
    }
  }

  return (
    <MessageAction
      tooltip={copied ? "Copied" : "Copy"}
      label={copied ? "Copied" : "Copy message"}
      disabled={disabled || !text}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => {
        void handleCopy();
      }}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-primary" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </MessageAction>
  );
}

/**
 * Renders the conversation message list with markdown, tool parts, and loading.
 */
export function ChatMessages({
  messages,
  status,
  branchDisabled = false,
  onBranchFromMessage,
}: ChatMessagesProps) {
  const isWaiting =
    status === "submitted" && messages.at(-1)?.role === "user";
  const lastMessageId = messages.at(-1)?.id;
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <Conversation className="chat-canvas">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8 md:gap-7 md:px-6 md:py-10">
        {messages.map((message) => {
          const text = getMessageText(message);
          const isGenerating =
            isStreaming &&
            message.id === lastMessageId &&
            message.role === "assistant";
          const showCopy =
            message.role === "assistant" && Boolean(text) && !isGenerating;

          return (
            <Message key={message.id} from={message.role}>
              <RoleBadge role={message.role} />
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (isTextUIPart(part)) {
                    if (!part.text.trim()) return null;
                    return (
                      <MessageResponse key={`${message.id}-text-${index}`}>
                        {part.text}
                      </MessageResponse>
                    );
                  }

                  if (
                    isToolUIPart(part) &&
                    getToolName(part) === "web_search"
                  ) {
                    return (
                      <WebSearchPart
                        key={`${message.id}-tool-${index}`}
                        part={part}
                      />
                    );
                  }

                  return null;
                })}
              </MessageContent>
              <MessageActions
                className={cn(
                  "mt-0.5 rounded-full border border-transparent bg-background/60 px-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-all",
                  "group-hover:opacity-100 group-focus-within:opacity-100",
                  message.role === "user" ? "mr-0.5" : "ml-0.5"
                )}
              >
                {showCopy ? <CopyMessageAction text={text} /> : null}
                <MessageAction
                  tooltip="Branch from here"
                  label="Branch from here"
                  disabled={branchDisabled}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onBranchFromMessage(message.id);
                  }}
                >
                  <GitBranchIcon className="size-3.5" />
                </MessageAction>
              </MessageActions>
            </Message>
          );
        })}

        {isWaiting ? (
          <Message from="assistant">
            <RoleBadge role="assistant" />
            <MessageContent className="min-h-12 justify-center">
              <Loader />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
