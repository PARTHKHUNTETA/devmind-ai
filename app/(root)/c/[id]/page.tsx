import {
  getActiveBranch,
  loadChatMessages,
} from '@/features/ai/actions/chat-store';
import { getConversation } from '@/features/conversation/actions/conversation-actions';
import { ConversationView } from '@/features/conversation/components/conversation-view';
import { notFound } from 'next/navigation';
import React from 'react'

type ConversationPageProps = {
    params: Promise<{ id: string }>;
  };

/**
 * Conversation page — loads the active branch path and renders the chat UI.
 */
const page = async({params}:ConversationPageProps) => {
    const {id} = await params;

    try {
      await getConversation(id)
    } catch {
      notFound()
    }

    const activeBranch = await getActiveBranch(id);
    const initialMessages = await loadChatMessages(id, activeBranch.id);

  return (
    <ConversationView
      key={`${id}:${activeBranch.id}`}
      conversationId={id}
      activeBranchId={activeBranch.id}
      initialMessages={initialMessages}
    />
  )

}

export default page
