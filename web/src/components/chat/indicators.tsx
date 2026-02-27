"use client";

import { Bot, Loader2 } from "lucide-react";
import { AgentEmoji, isClawDataEmoji } from "@/components/agent-emoji";
import type { AgentInfo } from "./types";

interface ThinkingIndicatorProps {
  agent?: AgentInfo;
}

export function ThinkingIndicator({ agent }: ThinkingIndicatorProps) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {agent?.emoji ? (
          <AgentEmoji emoji={agent.emoji} className="text-sm" iconClassName="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Thinking</span>
        <span className="flex gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      </div>
    </div>
  );
}

interface DelegationIndicatorProps {
  /** Display label of the agent performing work (may start with emoji) */
  label: string;
}

/** Split leading emoji (if any) from the rest of the label */
function parseEmojiLabel(label: string): { emoji: string | null; name: string } {
  // Match a leading emoji (1 or 2 code-points, possibly joined)
  const match = label.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
  if (match) {
    return { emoji: match[1], name: label.slice(match[0].length) || "sub-agent" };
  }
  return { emoji: null, name: label || "sub-agent" };
}

export function DelegationIndicator({ label }: DelegationIndicatorProps) {
  const { emoji, name } = parseEmojiLabel(label);

  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-blue-400/50 bg-blue-50 px-4 py-2.5 dark:bg-blue-950/30">
        {emoji ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-sm dark:bg-blue-900/50">
            <AgentEmoji emoji={emoji} iconClassName="h-4 w-4" />
          </span>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
          <span className="font-semibold">{name}</span> is working&hellip;
        </span>
        <span className="flex gap-0.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      </div>
    </div>
  );
}
