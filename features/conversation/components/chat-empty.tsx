import { SparklesIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Empty-state placeholder shown before the first message is sent. */
export function ChatEmpty() {
  return (
    <div className="chat-canvas flex flex-1 items-center justify-center px-4">
      <Empty className="max-w-md border-0">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-14 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <SparklesIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl font-semibold tracking-tight">
            How can I help you today?
          </EmptyTitle>
          <EmptyDescription className="text-pretty text-[15px] leading-relaxed">
            Ask anything — Devmind can search the web when it needs fresh
            information, and you can branch from any reply.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
