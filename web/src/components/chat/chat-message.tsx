"use client";

import { useState } from "react";
import {
  Bot,
  User,
  Info,
  ArrowRightLeft,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentEmoji } from "@/components/agent-emoji";
import type { ChatMessage, AgentInfo } from "./types";
import { MarkdownContent } from "./markdown-content";
import { ToolActivityCard } from "./tool-activity-card";
import { SecretsStoreCard } from "./secrets-store-card";
import { SkillSetupCard } from "./skill-setup-card";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** Current agent (for avatar/icon) */
  agent?: AgentInfo;
  /** Full list of agents (for resolving delegation targets) */
  agents?: AgentInfo[];
  /** Callback when user confirms storing a credential */
  onStoreSecret?: (field: string, envVar: string, value: string, label: string) => void;
  /** Callback when user rejects storing a credential */
  onRejectSecret?: (field: string) => void;
}

const roleIcon = {
  user: <User className="h-4 w-4" />,
  assistant: <Bot className="h-4 w-4" />,
  system: <Info className="h-3.5 w-3.5" />,
};

export function ChatMessageBubble({
  message: msg,
  agent,
  agents,
  onStoreSecret,
  onRejectSecret,
}: ChatMessageBubbleProps) {
  const showCopy = msg.role === "user" || msg.role === "assistant";

  // Tool activity messages render as cards, not bubbles
  if (msg.role === "tool_activity" && msg.toolActivity) {
    return <ToolActivityCard activity={msg.toolActivity} />;
  }

  // Secrets store offers render as confirmation cards
  if (msg.role === "secrets_store" && msg.secretsStore) {
    return (
      <SecretsStoreCard
        data={msg.secretsStore}
        onStore={onStoreSecret ?? (() => {})}
        onReject={onRejectSecret ?? (() => {})}
      />
    );
  }

  // Skill setup form cards
  if (msg.role === "skill_setup" && msg.skillSetup) {
    return (
      <SkillSetupCard
        data={msg.skillSetup}
        onStore={onStoreSecret ?? (() => {})}
      />
    );
  }

  return (
    <div
      className={cn(
        "group/msg flex gap-2",
        msg.role === "user" && "justify-end",
        (msg.role === "system" ||
          msg.role === "delegation") &&
          "justify-center",
      )}
    >
      {/* Assistant avatar */}
      {msg.role === "assistant" && (
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          title={agent?.name || agent?.id}
        >
          {agent?.emoji ? (
            <AgentEmoji emoji={agent.emoji} className="text-sm" iconClassName="h-4 w-4" />
          ) : (
            roleIcon.assistant
          )}
        </div>
      )}

      {/* Copy button — left side for user messages */}
      {showCopy && msg.role === "user" && (
        <CopyButton text={msg.content} side="left" />
      )}

      {/* Message body */}
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm",
          msg.role === "user" && "bg-primary text-primary-foreground",
          msg.role === "assistant" && "bg-muted/60",
          msg.role === "delegation" && "bg-transparent",
          msg.role === "system" &&
            "bg-transparent text-xs text-muted-foreground italic",
        )}
      >
        {msg.role === "delegation" ? (
          <DelegationBubble message={msg} agents={agents} />
        ) : msg.role === "assistant" ? (
          <div>
            <MarkdownContent content={msg.content} />
            {msg.streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/40" />
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">
            {msg.content}
          </p>
        )}
      </div>

      {/* Copy button — right side for assistant messages */}
      {showCopy && msg.role === "assistant" && (
        <CopyButton text={msg.content} side="right" />
      )}

      {/* User avatar */}
      {msg.role === "user" && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {roleIcon.user}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function CopyButton({ text, side }: { text: string; side: "left" | "right" }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/msg:opacity-100",
        side === "left" && "order-first",
      )}
      title="Copy message"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function DelegationBubble({
  message: msg,
  agents,
}: {
  message: ChatMessage;
  agents?: AgentInfo[];
}) {
  const atMatch = msg.content.match(/@(\S+)/);
  const targetId = atMatch?.[1] ?? "";
  const targetAgent = agents?.find((a) => a.id === targetId);
  const agentName = targetAgent
    ? (targetAgent.name || targetId)
    : targetId || "sub-agent";
  const agentEmoji = targetAgent?.emoji;

  const agentLabel = (
    <span className="inline-flex items-center gap-1 font-semibold">
      {agentEmoji && <AgentEmoji emoji={agentEmoji} iconClassName="h-3.5 w-3.5" />}
      {agentName}
    </span>
  );

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-blue-400/50 bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-blue-500" />
      <span className="text-xs text-blue-700 dark:text-blue-300">
        {msg.toolPhase === "end" ? (
          <>
            Delegated to {agentLabel}
          </>
        ) : (
          <>
            Delegating to {agentLabel}…
          </>
        )}
      </span>
      {msg.toolPhase !== "end" && (
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      )}
      {msg.toolPhase === "end" && (
        <span className="text-xs text-green-500">✓</span>
      )}
    </div>
  );
}
