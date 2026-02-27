/* Shared types used across chat components */

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool" | "delegation";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  toolName?: string;
  toolPhase?: "start" | "end";
}

export interface TraceEvent {
  id: number;
  ts: number;
  phase: string;
  runId: string;
  stream: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

export interface AgentInfo {
  id: string;
  name?: string;
  emoji?: string;
}
