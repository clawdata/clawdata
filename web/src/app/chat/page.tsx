"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher, type OpenClawAgentsList, type OnboardingStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Send,
  Loader2,
  Plug,
  PlugZap,
  Bot,
  RotateCcw,
  Activity,
  ArrowDown,
  History,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentEmoji } from "@/components/agent-emoji";

import type { AgentInfo } from "@/components/chat/types";
import { ChatMessageBubble } from "@/components/chat/chat-message";
import {
  ThinkingIndicator,
  DelegationIndicator,
} from "@/components/chat/indicators";
import { TracePanel } from "@/components/chat/trace-panel";
import { ChatHistory } from "@/components/chat/chat-history";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { SetupWizardDialog } from "@/components/openclaw/setup-wizard-dialog";

/* ── Page component ────────────────────────────────────────────────── */

export default function ChatPage() {
  const { data: agentsData } = useSWR<OpenClawAgentsList>(
    "/api/openclaw/agents",
    fetcher,
  );
  const { data: onboarding } = useSWR<OnboardingStatus>(
    "/api/openclaw/onboarding",
    fetcher,
    { refreshInterval: 10_000 },
  );
  const agents = agentsData?.agents;
  const [agentId, setAgentId] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const needsSetup = onboarding && !onboarding.onboarded;

  const currentAgent: AgentInfo | undefined = agents?.find(
    (a) => a.id === agentId,
  );

  /* ── Chat hook ─────────────────────────────────────────────────── */
  const chat = useAgentChat(agentId, agents);

  /* ── Local UI state ────────────────────────────────────────────── */
  const [input, setInput] = useState("");
  const [showTrace, setShowTrace] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (agents?.length && !agentId) setAgentId(agents[0].id);
  }, [agents, agentId]);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages, isAtBottom]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
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

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col md:h-[calc(100vh-2.5rem)]">
      {/* Setup wizard (triggered from warning) */}
      <SetupWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialStep={!onboarding?.any_api_key_configured ? 2 : undefined}
      />

      {/* Setup warning */}
      {needsSetup && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {!onboarding.any_api_key_configured
                ? "No API keys configured. Add at least one LLM provider key to start chatting."
                : "OpenClaw setup is incomplete. Complete the setup wizard to use chat."}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-3 shrink-0"
              onClick={() => setWizardOpen(true)}
            >
              Open Setup
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 pb-4 sm:gap-3">
        <h1 className="text-2xl font-bold">Chat</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant={showHistory ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHistory((v) => !v)}
            className="gap-1.5"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </Button>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Agent…" />
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
            <Button variant="outline" size="sm" onClick={chat.disconnect}>
              <PlugZap className="mr-1.5 h-3.5 w-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={chat.connect}
              disabled={!agentId || chat.connecting}
            >
              {chat.connecting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Connect
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={chat.newChat}
            disabled={chat.connecting}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            New Chat
          </Button>
          <Button
            variant={showTrace ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTrace((v) => !v)}
            className="hidden gap-1.5 sm:flex"
          >
            <Activity className="h-3.5 w-3.5" />
            Trace
            {chat.traceEvents.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-4 min-w-4 justify-center px-1 text-[10px]"
              >
                {chat.traceEvents.length}
              </Badge>
            )}
          </Button>
          <Badge
            variant={chat.connected ? "default" : "secondary"}
            className="text-xs"
          >
            {chat.connected ? "Live" : "Off"}
          </Badge>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 gap-0 overflow-hidden rounded-lg border bg-card">
        {/* History sidebar */}
        <ChatHistory
          agentId={agentId}
          activeSessionKey={chat.sessionKey}
          onSelectSession={chat.selectSession}
          onNewChat={chat.newChat}
          open={showHistory}
          onClose={() => setShowHistory(false)}
        />

        {/* Messages panel */}
        <div
          className={cn(
            "relative flex flex-1 flex-col overflow-hidden",
            showTrace && "max-w-[60%]",
          )}
        >
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="relative h-full overflow-y-auto p-4"
          >
            {chat.messages.length === 0 ? (
              <div className="flex h-full min-h-50 flex-col items-center justify-center text-sm text-muted-foreground">
                {currentAgent?.emoji ? (
                  <span className="mb-2 text-3xl opacity-50">
                    <AgentEmoji emoji={currentAgent.emoji} iconClassName="h-8 w-8" />
                  </span>
                ) : (
                  <Bot className="mb-2 h-8 w-8 opacity-30" />
                )}
                {chat.connecting
                  ? "Connecting…"
                  : chat.connected
                    ? `Chat with ${currentAgent?.name || agentId}`
                    : "Waiting for agent connection"}
              </div>
            ) : (
              <div className="space-y-3">
                {chat.messages.map((msg, i) => (
                  <ChatMessageBubble
                    key={i}
                    message={msg}
                    agent={currentAgent}
                    agents={agents}
                  />
                ))}

                {/* Thinking indicator */}
                {chat.thinking && !chat.streaming && !chat.delegating && (
                  <ThinkingIndicator agent={currentAgent} />
                )}

                {/* Delegation indicator */}
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
          </div>

          {/* Scroll-to-bottom FAB */}
          {!isAtBottom && chat.messages.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-md transition-all hover:bg-muted"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Trace panel */}
        {showTrace && <TracePanel events={chat.traceEvents} />}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 pt-3"
      >
        <Textarea
          ref={chat.inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            const ta = e.target;
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={chat.connected ? "Type a message… (Shift+Enter for newline)" : "Connect first…"}
          disabled={!chat.connected}
          className="flex-1 min-h-[40px] max-h-[200px] resize-none"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!chat.connected || !input.trim()}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
