"use server"

import { requireUser } from "@/features/auth/action/require-user"
import { prisma } from "@/lib/db"

export async function startNewChat() {
    const user = await requireUser()

    const conversation = await prisma.$transaction(async (tx) => {
        const created = await tx.conversation.create({
            data: {
                userId: user.id,
                title: "New Chat",
            },
        })

        const mainBranch = await tx.conversationBranch.create({
            data: {
                conversationId: created.id,
                name: "Main",
            },
        })

        return tx.conversation.update({
            where: { id: created.id },
            data: { activeBranchId: mainBranch.id },
        })
    })

    return conversation.id
}