"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  fetcher,
  type OpenClawAgentsList,
} from "@/lib/api";
import { useAgentChat } from "@/hooks/use-agent-chat";
import type { AgentInfo } from "@/components/chat/types";
import { ChatMessageBubble } from "@/components/chat/chat-message";
import {
  ThinkingIndicator,
  DelegationIndicator,
} from "@/components/chat/indicators";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Send,
  Plug,
  PlugZap,
  RotateCcw,
  Loader2,
  ArrowDown,
  Bot,
} from "lucide-react";
import { AgentEmoji } from "@/components/agent-emoji";
import { usePathname } from "next/navigation";

/**
 * Floating chat button + slide-over panel available on every page
 * except `/chat` (where the full chat page lives).
 */
export function GlobalChatSlideOver() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const { data: agentsData } = useSWR<OpenClawAgentsList>(
    "/api/openclaw/agents",
    fetcher,
  );
  const agents = agentsData?.agents;
  const [agentId, setAgentId] = useState("");

  const currentAgent: AgentInfo | undefined = agents?.find(
    (a) => a.id === agentId,
  );

  const chat = useAgentChat(agentId, agents, { autoConnect: false });

  // Auto-select default agent
  useEffect(() => {
    if (agents?.length && !agentId) setAgentId(agents[0].id);
  }, [agents, agentId]);

  // Auto-connect when the panel opens
  useEffect(() => {
    if (open && agentId && !chat.connected && !chat.connecting) {
      chat.connect();
    }
  }, [open, agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages, isAtBottom]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setIsAtBottom(
      el.scrollHeight - el.scrollTop - el.clientHeight < 60,
    );
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    chat.send(text);
    setInput("");
    if (chat.inputRef.current) {
      chat.inputRef.current.style.height = "auto";
    }
    chat.inputRef.current?.focus();
  }

  // Hide the FAB on the /chat page
  if (pathname === "/chat") return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open chat"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        {/* Header */}
        <SheetHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base">Quick Chat</SheetTitle>
            <Badge
              variant={chat.connected ? "default" : "secondary"}
              className="text-[10px]"
            >
              {chat.connected ? "Live" : "Off"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Agent\u2026" />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="inline-flex items-center gap-1">
                      {a.emoji && <AgentEmoji emoji={a.emoji} iconClassName="h-3.5 w-3.5" />}
                      {a.name || a.id}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chat.connected ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={chat.disconnect}
              >
                <PlugZap className="mr-1 h-3 w-3" />
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={chat.connect}
                disabled={!agentId || chat.connecting}
              >
                {chat.connecting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Plug className="mr-1 h-3 w-3" />
                )}
                Connect
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={chat.newChat}
              disabled={chat.connecting}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </SheetHeader>

        {/* Messages area */}
        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto p-3"
        >
          {chat.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
              {currentAgent?.emoji ? (
                <span className="mb-2 text-2xl opacity-50">
                  <AgentEmoji emoji={currentAgent.emoji} iconClassName="h-6 w-6" />
                </span>
              ) : (
                <Bot className="mb-2 h-6 w-6 opacity-30" />
              )}
              {chat.connecting
                ? "Connecting\u2026"
                : chat.connected
                  ? `Chat with ${currentAgent?.name || agentId}`
                  : "Select an agent and connect"}
            </div>
          ) : (
            <div className="space-y-2">
              {chat.messages.map((msg, i) => (
                <ChatMessageBubble
                  key={i}
                  message={msg}
                  agent={currentAgent}
                  agents={agents}
                />
              ))}
              {chat.thinking &&
                !chat.streaming &&
                !chat.delegating && (
                  <ThinkingIndicator agent={currentAgent} />
                )}
              {chat.delegating && (
                <DelegationIndicator
                  label={
                    typeof chat.delegating === "string"
                      ? chat.delegating
                      : "sub-agent"
                  }
                />
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Scroll-to-bottom */}
          {!isAtBottom && chat.messages.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-2 left-1/2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-md transition-all hover:bg-muted"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex shrink-0 gap-2 border-t p-3"
        >
          <Textarea
            ref={chat.inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.target;
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              chat.connected
                ? "Message\u2026"
                : "Connect first\u2026"
            }
            disabled={!chat.connected}
            className="min-h-[36px] max-h-[120px] flex-1 resize-none text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 self-end"
            disabled={!chat.connected || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
