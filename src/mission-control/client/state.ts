/**
 * Mission Control — Global application state.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  role?: string;
  status: string;
  model?: string;
  agentId?: string;
  percentUsed?: number;
  tokenUsage?: { total: number };
  contextTokens?: number;
  lastSeen?: string;
  identName?: string;
  identEmoji?: string;
  theme?: string;
  isDefault?: boolean;
  agentSkills?: string[];
  [key: string]: unknown;
}

export interface FeedEvent {
  id: string;
  type: string;
  title: string;
  detail?: string;
  body?: string;
  timestamp: string;
  actor?: string;
  icon?: string;
}

export interface Skill {
  name: string;
  emoji?: string;
  description?: string;
  linked: boolean;
  available: boolean;
  installed?: boolean;
  source?: string;
  tags?: string[];
}

export interface TaskActivity {
  timestamp: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface QueueItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  source?: string;
  assignee?: string;
  riskLevel?: string;
  steps?: string[];
  createdAt?: string;
  updatedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
  tags?: string[];
  activity?: TaskActivity[];
}

export interface GatewayHealth {
  ok: boolean;
  heartbeatSeconds?: number;
  defaultAgentId?: string;
  channels: Record<string, ChannelInfo>;
  channelOrder?: string[];
}

export interface ChannelInfo {
  configured: boolean;
  running: boolean;
  probe?: { ok: boolean; elapsedMs: number; bot?: { name: string }; team?: { name: string } };
  botName?: string;
  teamName?: string;
}

export interface Presence {
  host: string;
  ip: string;
  version: string;
  platform: string;
  mode: string;
}

export interface UsageCostDay {
  date?: string;
  totalTokens?: number;
  totalCost?: number;
}

export interface AgentConfig {
  id: string;
  identityName?: string;
  identityEmoji?: string;
  identityTheme?: string;
  identityAvatar?: string;
  identityFull?: { name?: string; emoji?: string; theme?: string; avatar?: string };
  isDefault?: boolean;
  bindings?: number;
  identity?: { name?: string; emoji?: string; theme?: string; avatar?: string };
  workspaceFiles?: string[];
  soulSummary?: string;
}

export interface WorkspaceFile {
  name: string;
  size: number;
  modified: string;
  content: string;
}

export interface MemoryFile {
  name: string;
  type: "long-term" | "daily";
  path: string;
  size: number;
  modified: string;
  preview: string;
}

export interface AgentMemory {
  name: string;
  files: MemoryFile[];
  totalFiles: number;
  totalSize: number;
}

export interface DashboardData {
  project?: string;
  gateway?: string;
  gatewayHealth?: GatewayHealth | null;
  presence?: Presence[];
  usageCost?: UsageCostDay[];
  agents?: { list: Agent[]; active: number; total: number };
  queue?: { items: QueueItem[]; inbox: number; assigned: number; inProgress: number; review: number; done: number; total: number };
  tasks?: unknown;
  feed?: FeedEvent[];
}

export interface AppState {
  dashboard: DashboardData | null;
  agents: Agent[];
  queue: QueueItem[];
  feed: FeedEvent[];
  skills: Skill[];
  gateway: string;
  gatewayHealth: GatewayHealth | null;
  presence: Presence[];
  usageCost: UsageCostDay[];
  currentPage: string;
  activeFeedTab: string;
  sidebarCollapsed: boolean;
  commanderOpen: boolean;
  commanderQuery: string;
  commanderIndex: number;
  agentConfig: AgentConfig[];
  agentConfigLoading: boolean;
  selectedAgentId: string | null;
  roleApplyTarget: { roleId: string; agentName: string } | null;
  memory: AgentMemory[];
  memoryLoading: boolean;
  memorySelectedAgent: string | null;
  memorySelectedFile: string | null;
  memoryFileContent: string | null;
  hideDebug: boolean;
}

// ── State singleton ──────────────────────────────────────────────────

export const state: AppState = {
  dashboard: null,
  agents: [],
  queue: [],
  feed: [],
  skills: [],
  gateway: "connecting",
  gatewayHealth: null,
  presence: [],
  usageCost: [],
  currentPage: "dashboard",
  activeFeedTab: "all",
  sidebarCollapsed: false,
  commanderOpen: false,
  commanderQuery: "",
  commanderIndex: 0,
  agentConfig: [],
  agentConfigLoading: false,
  selectedAgentId: null,
  roleApplyTarget: null,
  memory: [],
  memoryLoading: false,
  memorySelectedAgent: null,
  memorySelectedFile: null,
  memoryFileContent: null,
  hideDebug: true,
};
