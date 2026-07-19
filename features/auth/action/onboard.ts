"use server"

import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/db"
import type {User} from "@/lib/generated/prisma/client"

export async function onBoard(){
    const user = await currentUser()
    if(!user){
       throw new Error("Unauthorized")
    }
    const email = user.emailAddresses[0]?.emailAddress ?? null

    return prisma.user.upsert({
        where: { clerkId: user.id },
        create: { 
            clerkId: user.id,
            email,
            firstname: user.firstName,
            lastname: user.lastName,
            imageUrl: user.imageUrl
        },
        update: { 
            email,
            firstname: user.firstName,
            lastname: user.lastName,
            imageUrl: user.imageUrl
         }
    })
}