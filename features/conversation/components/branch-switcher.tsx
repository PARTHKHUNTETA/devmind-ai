"use client";

import { CheckIcon, GitBranchIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useBranches,
  useRenameBranch,
} from "@/features/conversation/hooks/use-branches";
import { cn } from "@/lib/utils";

type BranchSwitcherProps = {
  conversationId: string;
  activeBranchId: string | null;
  className?: string;
  disabled?: boolean;
  onSwitchBranch: (branchId: string) => void;
  onDeleteBranch: (branchId: string) => void;
};

/**
 * Header control to view, switch, rename, and delete conversation branches.
 */
export function BranchSwitcher({
  conversationId,
  activeBranchId,
  className,
  disabled = false,
  onSwitchBranch,
  onDeleteBranch,
}: BranchSwitcherProps) {
  const { data: branches = [], isLoading } = useBranches(conversationId);
  const renameBranch = useRenameBranch(conversationId);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const active =
    branches.find((branch) => branch.id === activeBranchId) ??
    branches.find((branch) => branch.isActive) ??
    branches[0];

  function startRename(branchId: string, currentName: string) {
    setRenamingId(branchId);
    setRenameValue(currentName);
  }

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    renameBranch.mutate({ branchId: renamingId, name: trimmed });
    setRenamingId(null);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 rounded-full border-border/70 bg-background/70 text-xs shadow-sm backdrop-blur-sm",
              className
            )}
            disabled={disabled || isLoading || branches.length === 0}
          />
        }
      >
        <GitBranchIcon className="size-3.5" />
        <span className="max-w-32 truncate">{active?.name ?? "Branch"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Branches</DropdownMenuLabel>
          {branches.map((branch) => {
            const isActive = branch.id === (active?.id ?? activeBranchId);

            if (renamingId === branch.id) {
              return (
                <div
                  key={branch.id}
                  className="flex items-center gap-1 px-2 py-1.5"
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    className="h-7 flex-1 rounded-md border bg-background px-2 text-xs outline-none"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={commitRename}
                    aria-label="Save name"
                  >
                    <CheckIcon className="size-3.5" />
                  </Button>
                </div>
              );
            }

            return (
              <DropdownMenuItem
                key={branch.id}
                className="group flex items-center gap-2"
                disabled={disabled}
                onClick={() => {
                  if (!isActive) {
                    onSwitchBranch(branch.id);
                  }
                }}
              >
                <CheckIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                <span
                  className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    aria-label={`Rename ${branch.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      startRename(branch.id, branch.name);
                    }}
                  >
                    <PencilIcon className="size-3" />
                  </button>
                  {branch.name !== "Main" ? (
                    <button
                      type="button"
                      className="rounded p-1 text-destructive hover:bg-muted"
                      aria-label={`Delete ${branch.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteBranch(branch.id);
                      }}
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  ) : null}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
