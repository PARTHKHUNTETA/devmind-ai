"use client";

import * as React from "react";
import { ArrowUpIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ChatComposerProps = {
  onSend: (content: string) => Promise<void> | void;
  isSending?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
};

/**
 * Message input form with send button. Enter sends; Shift+Enter inserts a newline.
 */
export function ChatComposer({
  onSend,
  isSending = false,
  placeholder = "Message Devmind…",
  className,
  autoFocus = false,
}: ChatComposerProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  /** Submits the current message when the form is submitted or Enter is pressed. */
  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const content = value.trim();
    if (!content || isSending) return;

    setValue("");
    await onSend(content);
    textareaRef.current?.focus();
  }

  /** Handles keyboard shortcuts — Enter to send, Shift+Enter for a new line. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  const canSend = value.trim().length > 0 && !isSending;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={cn("mx-auto w-full max-w-3xl px-4 pb-5 md:px-6", className)}
    >
      <InputGroup className="h-auto min-h-14 rounded-[1.75rem] border-border/70 bg-card/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-sm transition-shadow focus-within:shadow-[0_10px_36px_rgba(0,0,0,0.1)] focus-within:ring-primary/25 dark:bg-card/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)] dark:ring-white/5">
        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isSending}
          rows={1}
          className="max-h-48 min-h-12 py-3.5 pl-4 text-[15px] leading-relaxed placeholder:text-muted-foreground/70"
        />
        <InputGroupAddon align="inline-end" className="self-end pr-2 pb-2">
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            disabled={!canSend}
            className="size-9 rounded-full shadow-sm transition-transform enabled:hover:scale-105"
            aria-label="Send message"
          >
            {isSending ? <Spinner /> : <ArrowUpIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
        Devmind can make mistakes. Check important info.
      </p>
    </form>
  );
}