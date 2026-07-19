"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { ChevronDownIcon, GlobeIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

type MessagePart = UIMessage["parts"][number];

type WebSearchOutput = {
  action?: { query?: string };
  sources?: Array<{ type?: string; url?: string; title?: string }>;
};

function getSearchQuery(part: Extract<MessagePart, { type: string }>) {
  if (!isToolUIPart(part)) return undefined;
  const input = part.input as { query?: string } | undefined;
  if (input?.query) return input.query;

  if (part.state === "output-available") {
    const output = part.output as WebSearchOutput | undefined;
    return output?.action?.query;
  }

  return undefined;
}

function getSearchSources(part: Extract<MessagePart, { type: string }>) {
  if (!isToolUIPart(part) || part.state !== "output-available") return [];
  const output = part.output as WebSearchOutput | undefined;
  return (output?.sources ?? []).filter(
    (source): source is { url: string; title?: string } =>
      typeof source?.url === "string" && source.url.length > 0
  );
}

type WebSearchPartProps = {
  part: MessagePart;
};

/**
 * Renders a streamed web_search tool invocation: loading, results, or error.
 */
export function WebSearchPart({ part }: WebSearchPartProps) {
  const [open, setOpen] = useState(false);

  if (!isToolUIPart(part) || getToolName(part) !== "web_search") {
    return null;
  }

  const query = getSearchQuery(part);
  const sources = getSearchSources(part);
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const isDone = part.state === "output-available";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border bg-muted/40 px-3 py-2 text-sm",
          isError && "border-destructive/40 bg-destructive/5"
        )}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
          {isLoading ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {isLoading
              ? query
                ? `Searching the web for “${query}”…`
                : "Searching the web…"
              : isError
                ? "Web search failed"
                : query
                  ? `Searched the web for “${query}”`
                  : "Searched the web"}
            {isDone && sources.length > 0
              ? ` · ${sources.length} source${sources.length === 1 ? "" : "s"}`
              : null}
          </span>
          {(isDone || isError) && (
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-2">
          {isError ? (
            <p className="text-xs text-destructive">
              {part.errorText || "Something went wrong while searching."}
            </p>
          ) : null}

          {isDone && sources.length > 0 ? (
            <ul className="space-y-1.5">
              {sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-foreground underline-offset-2 hover:underline"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {isDone && sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Search completed. Results were used to draft the answer below.
            </p>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
