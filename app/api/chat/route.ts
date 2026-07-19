import {
    getActiveBranch,
    loadChatMessages,
    saveChatMessages,
} from "@/features/ai/actions/chat-store";
import { webSearchTools } from "@/features/ai/tools/web-search";
import { getChatModel } from "@/features/ai/utils/model";
import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import {
    convertToModelMessages,
    createIdGenerator,
    createUIMessageStreamResponse,
    InvalidToolInputError,
    NoSuchToolError,
    stepCountIs,
    streamText,
    toUIMessageStream,
    type UIMessage,
} from "ai";

const DEFAULT_SYSTEM_PROMPT =
    "You are Devmind AI, a helpful assistant. " +
    "When the user asks about current events, recent information, or anything that may have changed after your training data, " +
    "use the web_search tool to look it up before answering. " +
    "Cite sources from the search results when relevant.";

/**
 * POST /api/chat — Streams an AI assistant reply for a conversation.
 *
 * Validates auth and ownership, persists the user message on the active branch,
 * then streams the assistant response via the AI SDK (including optional web search).
 * Final messages — including tool parts — are saved when the stream ends.
 */
export async function POST(req: Request) {
    await auth.protect();

    const { message, id }: { message: UIMessage; id: string } = await req.json();

    if (!message || !id) {
        return new Response("Missing message or conversation id", { status: 400 });
    }

    const user = await requireUser();

    const conversation = await prisma.conversation.findFirst({
        where: {
            id,
            userId: user.id,
        },
    });

    if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
    }

    const activeBranch = await getActiveBranch(id);
    const previousMessages = await loadChatMessages(id, activeBranch.id);

    const alreadySaved = previousMessages.some(
        (storedMessage) => storedMessage.id === message.id
    );

    const messages = alreadySaved ? previousMessages : [...previousMessages, message];

    if (!alreadySaved) {
        await saveChatMessages(id, [message], {
            parentId: activeBranch.headMessageId,
            branchId: activeBranch.id,
        });
    }

    const result = streamText({
        model: getChatModel(conversation.model),
        system: conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages, {
            tools: webSearchTools,
        }),
        tools: webSearchTools,
        stopWhen: stepCountIs(5),
    });

    result.consumeStream();

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({
            stream: result.stream,
            originalMessages: messages,
            generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
            onError: (error) => {
                if (NoSuchToolError.isInstance(error)) {
                    return "The model tried to call an unknown tool.";
                }
                if (InvalidToolInputError.isInstance(error)) {
                    return "The model called a tool with invalid inputs.";
                }
                if (error instanceof Error) {
                    return error.message;
                }
                return "An unexpected error occurred.";
            },
            onEnd: async ({ messages: finalMessages }) => {
                try {
                    // Existing rows keep their parentId; new assistant rows chain from
                    // the prior message while walking the batch. Branch head advances.
                    await saveChatMessages(id, finalMessages, {
                        updateTitle: false,
                        branchId: activeBranch.id,
                    });
                } catch (error) {
                    console.error(error);
                }
            },
        }),
    });
}
