"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listBranches,
  renameBranch,
} from "@/features/conversation/actions/branch-actions";
import { queryKeys } from "@/features/conversation/utils/query-keys";

/** Fetches named branches for a conversation. */
export function useBranches(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.branches.byConversation(conversationId),
    queryFn: () => listBranches(conversationId),
    enabled: Boolean(conversationId),
  });
}

/** Rename a branch. */
export function useRenameBranch(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ branchId, name }: { branchId: string; name: string }) =>
      renameBranch(branchId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.branches.byConversation(conversationId),
      });
      toast.success("Branch renamed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not rename branch");
    },
  });
}
