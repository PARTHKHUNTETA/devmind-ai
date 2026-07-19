"use client";

import {
  isTextUIPart,
  isToolUIPart,
  getToolName,
  type ChatStatus,
  type UIMessage,
} from "ai";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { WebSearchPart } from "./web-search-part";

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
};

/**
 * Renders the conversation message list with markdown, tool parts, and loading.
 */
export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const isWaiting =
    status === "submitted" && messages.at(-1)?.role === "user";

  return (
    <Conversation>
      <ConversationContent className="py-8">
        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
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

                if (isToolUIPart(part) && getToolName(part) === "web_search") {
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
          </Message>
        ))}

        {isWaiting ? (
          <Message from="assistant">
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
    </Conversation>
  );
}
