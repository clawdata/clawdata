"use client";

import { useState } from "react";
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

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200 overflow-hidden",
        open ? "w-64" : "w-0 border-r-0"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* New chat */}
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
              return (
                <div
                  key={session.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSession(session)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectSession(session); } }}
                  className={cn(
                    "group flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-medium leading-tight line-clamp-2">
                      {session.derived_title || session.display_name || "Untitled"}
                    </p>
                    <button
                      onClick={(e) => handleDelete(e, session)}
                      disabled={deleting === session.key}
                      className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete session"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {session.last_message_preview && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                      {session.last_message_preview}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
    </div>
  );
}
