"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createBranchFromMessage,
  deleteBranch,
  listBranches,
  renameBranch,
  switchBranch,
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

function useInvalidateBranches(conversationId: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.branches.byConversation(conversationId),
    });
  };
}

/** Create a branch from a message and refresh the conversation page. */
export function useCreateBranch(conversationId: string) {
  const router = useRouter();
  const invalidate = useInvalidateBranches(conversationId);

  return useMutation({
    mutationFn: ({
      messageId,
      name,
    }: {
      messageId: string;
      name?: string;
    }) => createBranchFromMessage(conversationId, messageId, name),
    onSuccess: () => {
      invalidate();
      router.refresh();
      toast.success("Branch created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not create branch");
    },
  });
}

/** Switch the active branch and remount chat via refresh. */
export function useSwitchBranch(conversationId: string) {
  const router = useRouter();
  const invalidate = useInvalidateBranches(conversationId);

  return useMutation({
    mutationFn: (branchId: string) => switchBranch(conversationId, branchId),
    onSuccess: () => {
      invalidate();
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not switch branch");
    },
  });
}

/** Rename a branch. */
export function useRenameBranch(conversationId: string) {
  const invalidate = useInvalidateBranches(conversationId);

  return useMutation({
    mutationFn: ({ branchId, name }: { branchId: string; name: string }) =>
      renameBranch(branchId, name),
    onSuccess: () => {
      invalidate();
      toast.success("Branch renamed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not rename branch");
    },
  });
}

/** Delete a non-Main branch. */
export function useDeleteBranch(conversationId: string) {
  const router = useRouter();
  const invalidate = useInvalidateBranches(conversationId);

  return useMutation({
    mutationFn: (branchId: string) => deleteBranch(branchId),
    onSuccess: () => {
      invalidate();
      router.refresh();
      toast.success("Branch deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not delete branch");
    },
  });
}
