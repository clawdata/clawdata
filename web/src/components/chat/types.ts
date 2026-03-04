/* Shared types used across chat components */

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool" | "delegation" | "tool_activity" | "secrets_access" | "secrets_store" | "skill_setup";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  toolName?: string;
  toolPhase?: "start" | "end";
  /** Rich metadata for tool_activity messages */
  toolActivity?: ToolActivity;
  /** Secrets access request data */
  secretsAccess?: SecretsAccessData;
  /** Secrets store offer data */
  secretsStore?: SecretsStoreData;
  /** Skill setup form data */
  skillSetup?: SkillSetupData;
}

/** Data for a secrets access request rendered inline in chat */
export interface SecretsAccessData {
  requestId: string;
  agentId: string;
  field: string;
  ref: { source: string; provider: string; id: string };
  reason: string;
  status: "pending" | "approved" | "denied";
  valueMasked?: string;
}

/** Data for a secrets store offer rendered inline in chat */
export interface SecretsStoreData {
  field: string;
  envVar: string;
  value: string;
  label: string;
  status: "pending" | "stored" | "rejected";
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

/** A single credential field in a skill setup form */
export interface SkillSetupField {
  envVar: string;
  label: string;
  placeholder: string;
  optional: boolean;
  configured: boolean;
}

/** Data for a skill setup form rendered inline in chat */
export interface SkillSetupData {
  skill: string;
  fields: SkillSetupField[];
  status: "pending" | "saving" | "saved" | "error";
}
