/* Shared types used across chat components */

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool" | "delegation" | "tool_activity";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  toolName?: string;
  toolPhase?: "start" | "end";
  /** Rich metadata for tool_activity messages */
  toolActivity?: ToolActivity;
}

/** Represents a single tool invocation shown inline in the chat */
export interface ToolActivity {
  name: string;
  phase: "running" | "completed" | "error";
  /** Arguments passed to the tool (e.g. SQL query) */
  args?: Record<string, unknown>;
  /** Result returned by the tool */
  result?: string;
  /** Structured result data (parsed JSON rows) */
  resultData?: Record<string, unknown>[];
  /** Duration in ms */
  durationMs?: number;
  /** Error message if phase === "error" */
  error?: string;
  /** Extracted SQL query from args */
  sql?: string;
  /** Human-friendly label for what the tool did */
  label?: string;
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
