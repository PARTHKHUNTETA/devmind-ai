import { openai } from "@ai-sdk/openai";

/**
 * OpenAI provider-executed web search tool.
 *
 * Key must be `web_search` so the streamed tool name matches the Responses API tool.
 * The model decides when to call it (`toolChoice: "auto"` by default).
 */
export const webSearchTools = {
  web_search: openai.tools.webSearch({
    searchContextSize: "medium",
  }),
} as const;

export type WebSearchTools = typeof webSearchTools;
