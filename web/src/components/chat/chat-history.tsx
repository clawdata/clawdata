"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  lifecycleApi,
  type SessionEntry,
  type SessionsResponse,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Trash2,
  MessageSquare,
  Clock,
  ChevronLeft,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatHistoryProps {
  agentId: string;
  activeSessionKey: string | null;
  onSelectSession: (session: SessionEntry) => void;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ChatHistory({
  agentId,
  activeSessionKey,
  onSelectSession,
  onNewChat,
  open,
  onClose,
}: ChatHistoryProps) {
  const {
    data: sessionsData,
    mutate,
  } = useSWR<SessionsResponse>(
    agentId ? `sessions:${agentId}` : null,
    () => lifecycleApi.agentSessions(agentId),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const sessions = sessionsData?.sessions ?? [];
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // --- selection helpers ---
  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(sessions.map((s) => s.key)));
  }, [sessions]);

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  // --- delete helpers ---
  async function handleDelete(e: React.MouseEvent, session: SessionEntry) {
    e.stopPropagation();
    setDeleting(session.key);
    try {
      await lifecycleApi.deleteSession(session.key);
      toast.success("Session deleted");
      mutate();
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleBulkDelete(keys: string[]) {
    if (keys.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        keys.map((k) => lifecycleApi.deleteSession(k))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        toast.success(`Deleted ${keys.length} session${keys.length > 1 ? "s" : ""}`);
      } else {
        toast.warning(`Deleted ${keys.length - failed} of ${keys.length} (${failed} failed)`);
      }
      exitSelectMode();
      mutate();
    } catch (err) {
      toast.error(`Bulk delete failed: ${String(err)}`);
    } finally {
      setBulkDeleting(false);
    }
  }

  const allSelected = sessions.length > 0 && selected.size === sessions.length;

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200 overflow-hidden",
        open ? "w-64" : "w-0 border-r-0"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        {selectMode ? (
          <>
            <span className="text-xs font-medium text-muted-foreground">
              {selected.size} selected
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={exitSelectMode}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </h3>
            <div className="flex items-center gap-0.5">
              {sessions.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSelectMode(true)}
                  title="Select sessions"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Selection toolbar */}
      {selectMode && sessions.length > 0 && (
        <div className="flex items-center justify-between border-b px-2 py-1.5 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-1.5"
            onClick={allSelected ? deselectAll : selectAll}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="destructive"
              size="sm"
              className="h-6 text-[10px] px-2"
              disabled={selected.size === 0 || bulkDeleting}
              onClick={() => handleBulkDelete(Array.from(selected))}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
        </div>
      )}

      {/* New chat (hidden in select mode) */}
      {!selectMode && (
        <div className="border-b px-2 py-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={onNewChat}
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </Button>
        </div>
      )}

      {/* Session list */}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageSquare className="h-6 w-6 mb-2 opacity-30" />
              <p className="text-xs">No sessions yet</p>
              <p className="text-[10px] mt-0.5 opacity-60">Send a message to start one</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.key === activeSessionKey;
              const isSelected = selected.has(session.key);
              return (
                <div
                  key={session.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (selectMode) toggleSelect(session.key);
                    else onSelectSession(session);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (selectMode) toggleSelect(session.key);
                      else onSelectSession(session);
                    }
                  }}
                  className={cn(
                    "group flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    selectMode && isSelected
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-start gap-2 min-w-0">
                      {selectMode && (
                        <span className="mt-0.5 shrink-0">
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </span>
                      )}
                      <p className="text-xs font-medium leading-tight line-clamp-2">
                        {session.derived_title || session.display_name || "Untitled"}
                      </p>
                    </div>
                    {!selectMode && (
                      <button
                        onClick={(e) => handleDelete(e, session)}
                        disabled={deleting === session.key}
                        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {session.last_message_preview && (
                    <p className={cn("text-[10px] text-muted-foreground line-clamp-1", selectMode && "ml-5.5")}>
                      {session.last_message_preview}
                    </p>
                  )}
                  <div className={cn("flex items-center gap-2 text-[10px] text-muted-foreground", selectMode && "ml-5.5")}>
                    {session.updated_at && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatRelative(session.updated_at)}
                      </span>
                    )}
                    {session.total_tokens > 0 && (
                      <span>{session.total_tokens.toLocaleString()} tok</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Delete All footer */}
      {!selectMode && sessions.length > 1 && (
        <div className="border-t px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={bulkDeleting}
            onClick={() => handleBulkDelete(sessions.map((s) => s.key))}
          >
            <Trash2 className="h-3 w-3" />
            Delete All ({sessions.length})
          </Button>
        </div>
      )}
    </div>
  );
}
