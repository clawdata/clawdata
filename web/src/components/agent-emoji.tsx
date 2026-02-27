"use client";

import { Shell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The ClawData "brand" emoji value used by the main agent.
 * When this emoji is encountered, we render the Lucide Shell icon instead.
 */
const CLAWDATA_EMOJI = "꩜";

interface AgentEmojiProps {
  emoji: string | undefined | null;
  /** Tailwind classes for the Shell icon (default: "h-[1em] w-[1em]") */
  iconClassName?: string;
  /** Tailwind classes for the emoji text span */
  className?: string;
}

/**
 * Renders an agent's emoji — or the Lucide Shell icon for the ClawData brand emoji.
 * Drop-in replacement for raw `{agent.emoji}` text rendering.
 */
export function AgentEmoji({ emoji, iconClassName, className }: AgentEmojiProps) {
  if (!emoji) return null;

  if (emoji === CLAWDATA_EMOJI) {
    return <Shell className={cn("h-[1em] w-[1em] inline-block", iconClassName)} />;
  }

  return <span className={cn("leading-none", className)}>{emoji}</span>;
}

/** Check if the given emoji is the ClawData brand emoji. */
export function isClawDataEmoji(emoji: string | undefined | null): boolean {
  return emoji === CLAWDATA_EMOJI;
}
