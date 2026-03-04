const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Generic fetcher ─────────────────────────────────────────────────

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// SWR fetcher
export const fetcher = <T = unknown>(path: string) => api<T>(path);

// ── Types ───────────────────────────────────────────────────────────

// Agents
export interface Agent {
  id: string;
  name: string;
  description: string;
  workspace_path: string;
  agent_dir: string;
  model: string;
  role: "agent" | "orchestrator";
  parent_id: string | null;
  source: "local" | "openclaw";
  emoji: string;
  openclaw_workspace: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  id: string;
  name: string;
  description?: string;
  model?: string;
  role?: "agent" | "orchestrator";
  parent_id?: string;
  emoji?: string;
}

// Skills
export interface Skill {
  id: string;
  name: string;
  description: string;
  agent_id: string | null;
  skill_path: string;
  is_enabled: boolean;
  created_at: string;
}

export interface SkillCreate {
  id: string;
  name: string;
  description?: string;
  agent_id?: string;
  content: string;
}

// Templates
export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  file_path: string;
  variables: string[];
  content?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateRenderResponse {
  template_id: string;
  rendered: string;
}

export interface TemplateCreate {
  id: string;
  name: string;
  category: "dbt" | "airflow" | "sql" | "custom";
  description?: string;
  content: string;
  variables?: string[];
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  content?: string;
  variables?: string[];
}

// Lifecycle
export interface NodeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  meets_minimum: boolean;
  minimum_version: string;
}

export interface NpmStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface OpenClawPackage {
  installed: boolean;
  version: string | null;
  path: string | null;
  latest_version: string | null;
  update_available: boolean;
}

export interface PrerequisiteStatus {
  node: NodeStatus;
  npm: NpmStatus;
  openclaw: OpenClawPackage;
  ready: boolean;
}

export interface GatewayStatus {
  state: string;
  pid: number | null;
  port: number;
  uptime_seconds: number | null;
  version: string | null;
  error: string | null;
}

export interface FullStatus {
  prerequisites: PrerequisiteStatus;
  gateway: GatewayStatus;
  config_path: string | null;
  workspace_path: string | null;
  checked_at: string;
}

export interface OnboardingStatus {
  config_exists: boolean;
  workspace_exists: boolean;
  gateway_token_set: boolean;
  any_channel_configured: boolean;
  any_api_key_configured: boolean;
  onboarded: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  output?: string;
}

export interface InstallResult {
  success: boolean;
  version_installed: string | null;
  message: string;
  output: string;
}

export interface UninstallResult {
  success: boolean;
  message: string;
  output: string;
}

export interface HealthResult {
  healthy: boolean;
  raw: Record<string, unknown>;
  error: string | null;
}

export interface DoctorResult {
  success: boolean;
  issues: string[];
  fixes_applied: string[];
  output: string;
}

export interface ConfigResponse {
  path: string;
  exists: boolean;
  config: Record<string, unknown>;
}

// Providers
export interface Provider {
  id: string;
  name: string;
  env_var: string;
  configured: boolean;
  onboard_flag: string;
  popular_models: string[];
}

export interface ProvidersResponse {
  providers: Provider[];
}

// Env keys
export interface EnvEntry {
  key: string;
  masked_value: string;
}

export interface EnvListResponse {
  entries: EnvEntry[];
  path: string;
}

// Models
export interface ModelsStatusResponse {
  current_model: string | null;
  image_model: string | null;
  fallbacks: string[];
  output: string;
}

export interface ModelCatalogEntry {
  key: string;
  name: string;
  input: string;
  context_window: number;
  local: boolean;
  available: boolean;
  tags: string[];
}

export interface ModelCatalogResponse {
  count: number;
  models: ModelCatalogEntry[];
}

// Setup
export interface SetupRequest {
  mode?: "local" | "remote";
  api_keys?: Record<string, string>;
  default_model?: string;
  start_gateway?: boolean;
}

export interface SetupResult {
  success: boolean;
  message: string;
  output: string;
  steps_completed: string[];
}

// OpenClaw agents (from openclaw.json)
export interface OpenClawAgent {
  id: string;
  name: string;
  emoji: string;
  model: string | null;
  skills: string[];
  is_default: boolean;
}

export interface OpenClawAgentsList {
  default_id: string;
  main_key: string;
  scope: string;
  agents: OpenClawAgent[];
}

export interface AgentCreatePayload {
  name: string;
  workspace?: string;
  emoji?: string;
  avatar?: string;
}

export interface AgentUpdatePayload {
  name?: string;
  model?: string;
  workspace?: string;
  avatar?: string;
}

// OpenClaw skills (from gateway)
export interface SkillRequirements {
  bins: string[];
  any_bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillConfigCheck {
  path: string;
  satisfied: boolean;
}

export interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

export interface OpenClawSkill {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  skill_key: string;
  emoji: string;
  homepage: string;
  primary_env: string | null;
  always: boolean;
  disabled: boolean;
  blocked_by_allowlist: boolean;
  eligible: boolean;
  requirements: SkillRequirements;
  missing: SkillRequirements;
  config_checks: SkillConfigCheck[];
  install: SkillInstallOption[];
}

export interface SkillsStatusResponse {
  skills: OpenClawSkill[];
}

export interface SkillInstallPayload {
  name: string;
  install_id: string;
  timeout_ms?: number;
}

export interface SkillUpdatePayload {
  enabled?: boolean;
  api_key?: string;
  env?: Record<string, string>;
}

// Agent detail/files/sessions
export interface AgentFile {
  name: string;
  path: string | null;
  missing: boolean;
  size: number | null;
  updated_at_ms: number | null;
  content: string | null;
}

export interface AgentFilesResponse {
  agent_id: string;
  workspace: string;
  files: AgentFile[];
}

export interface SessionEntry {
  key: string;
  kind: string;
  display_name: string;
  channel: string;
  updated_at: string | null;
  session_id: string;
  model_provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  derived_title: string | null;
  last_message_preview: string | null;
}

export interface SessionsResponse {
  count: number;
  sessions: SessionEntry[];
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp: string | null;
  tool_name: string | null;
}

export interface SessionHistoryResponse {
  messages: SessionMessage[];
  session_id: string;
  agent_id: string;
}

export interface AgentDetail {
  id: string;
  name: string;
  emoji: string;
  model: string | null;
  is_default: boolean;
  workspace: string;
  source: "local" | "openclaw";
  files: AgentFile[];
  skills: OpenClawSkill[];
  sessions: SessionEntry[];
}

// Health
export interface AppHealth {
  status: string;
  service: string;
  openclaw: {
    state: string;
    port: number;
    version: string | null;
  };
}

// ── API methods ─────────────────────────────────────────────────────

// Agents
export const agentApi = {
  list: () => api<Agent[]>("/api/agents/"),
  get: (id: string) => api<Agent>(`/api/agents/${id}`),
  create: (data: AgentCreate) =>
    api<Agent>("/api/agents/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<AgentCreate>) =>
    api<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<void>(`/api/agents/${id}`, { method: "DELETE" }),
  openFolder: (id: string) =>
    api<{ ok: boolean; path: string }>(`/api/agents/${id}/open-folder`, { method: "POST" }),
};

// Skills
export const skillApi = {
  list: () => api<Skill[]>("/api/skills/"),
  get: (id: string) => api<Skill>(`/api/skills/${id}`),
  create: (data: SkillCreate) =>
    api<Skill>("/api/skills/", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<void>(`/api/skills/${id}`, { method: "DELETE" }),
};

export interface TemplateSyncResult {
  created: string[];
  updated: string[];
  message: string;
}

// File tree types for live browsing
export interface FileTreeEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  children?: FileTreeEntry[];
}

export interface BrowseResponse {
  root: string;
  tree: FileTreeEntry[];
}

export interface FileContentResponse {
  path: string;
  name: string;
  content: string;
  size: number;
}

// Templates
export const templateApi = {
  list: () => api<Template[]>("/api/templates/"),
  get: (id: string) => api<Template>(`/api/templates/${id}`),
  create: (data: TemplateCreate) =>
    api<Template>("/api/templates/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: TemplateUpdate) =>
    api<Template>(`/api/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    api<void>(`/api/templates/${id}`, { method: "DELETE" }),
  render: (id: string, variables: Record<string, string>) =>
    api<TemplateRenderResponse>(`/api/templates/${id}/render`, {
      method: "POST",
      body: JSON.stringify({ variables }),
    }),
  sync: () =>
    api<TemplateSyncResult>("/api/templates/sync", { method: "POST" }),
  browse: () => api<BrowseResponse>("/api/templates/browse"),
  readFile: (path: string) =>
    api<FileContentResponse>(`/api/templates/browse/file?path=${encodeURIComponent(path)}`),
};

// Lifecycle
export const lifecycleApi = {
  status: () => api<FullStatus>("/api/openclaw/status"),
  onboarding: () => api<OnboardingStatus>("/api/openclaw/onboarding"),
  install: (version = "latest", installDaemon = true) =>
    api<InstallResult>("/api/openclaw/install", {
      method: "POST",
      body: JSON.stringify({ version, install_daemon: installDaemon }),
    }),
  update: (channel = "stable") =>
    api<ActionResult>("/api/openclaw/update", {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
  uninstall: () =>
    api<UninstallResult>("/api/openclaw/uninstall", { method: "POST" }),
  start: (port = 18789) =>
    api<ActionResult>("/api/openclaw/start", {
      method: "POST",
      body: JSON.stringify({ port }),
    }),
  stop: () => api<ActionResult>("/api/openclaw/stop", { method: "POST" }),
  restart: () => api<ActionResult>("/api/openclaw/restart", { method: "POST" }),
  health: () => api<HealthResult>("/api/openclaw/health"),
  costing: () => api<CostingSummary>("/api/openclaw/costing"),
  doctor: (fix = false) => api<DoctorResult>(`/api/openclaw/doctor?fix=${fix}`),
  logs: (lines = 100) => api<{ lines: number; output: string }>(`/api/openclaw/logs?lines=${lines}`),
  getConfig: () => api<ConfigResponse>("/api/openclaw/config"),
  setConfig: (config: Record<string, unknown>) =>
    api<ActionResult>("/api/openclaw/config", {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),
  patchConfig: (patch: Record<string, unknown>) =>
    api<ActionResult>("/api/openclaw/config", {
      method: "PATCH",
      body: JSON.stringify({ patch }),
    }),
  // Providers & API keys
  providers: () => api<ProvidersResponse>("/api/openclaw/providers"),
  listEnv: () => api<EnvListResponse>("/api/openclaw/env"),
  setEnv: (key: string, value: string) =>
    api<ActionResult>("/api/openclaw/env", {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    }),
  deleteEnv: (key: string) =>
    api<ActionResult>(`/api/openclaw/env/${key}`, { method: "DELETE" }),
  // Models
  modelsStatus: () => api<ModelsStatusResponse>("/api/openclaw/models/status"),
  modelsCatalog: () => api<ModelCatalogResponse>("/api/openclaw/models/catalog"),
  setModel: (model: string) =>
    api<ActionResult>("/api/openclaw/models/set", {
      method: "POST",
      body: JSON.stringify({ model }),
    }),
  // Setup wizard
  setup: (req?: SetupRequest) =>
    api<SetupResult>("/api/openclaw/setup", {
      method: "POST",
      body: JSON.stringify(req ?? {}),
    }),
  // OpenClaw agents
  agents: () => api<OpenClawAgentsList>("/api/openclaw/agents"),
  resetAgents: () =>
    api<ActionResult>("/api/openclaw/agents/reset", { method: "POST" }),
  createAgent: (payload: AgentCreatePayload) =>
    api<ActionResult>("/api/openclaw/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAgent: (agentId: string, payload: AgentUpdatePayload) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAgent: (agentId: string, deleteFiles = true) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}?delete_files=${deleteFiles}`, {
      method: "DELETE",
    }),
  // OpenClaw skills
  skills: (agentId?: string) =>
    api<SkillsStatusResponse>(
      agentId ? `/api/openclaw/skills?agent_id=${agentId}` : "/api/openclaw/skills"
    ),
  installSkill: (payload: SkillInstallPayload) =>
    api<ActionResult>("/api/openclaw/skills/install", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSkill: (skillKey: string, payload: SkillUpdatePayload) =>
    api<ActionResult>(`/api/openclaw/skills/${skillKey}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  // Agent detail, files & sessions
  agentDetail: (agentId: string) =>
    api<AgentDetail>(`/api/openclaw/agents/${agentId}/detail`),
  agentFiles: (agentId: string) =>
    api<AgentFilesResponse>(`/api/openclaw/agents/${agentId}/files`),
  agentFile: (agentId: string, name: string) =>
    api<AgentFile>(`/api/openclaw/agents/${agentId}/files/${name}`),
  setAgentFile: (agentId: string, name: string, content: string) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}/files/${name}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  updateLinkedAgents: (agentId: string, linkedIds: string[]) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}/linked-agents`, {
      method: "PUT",
      body: JSON.stringify({ linked_ids: linkedIds }),
    }),
  agentSessions: (agentId: string) =>
    api<SessionsResponse>(`/api/openclaw/agents/${agentId}/sessions`),
  resetSession: (key: string) =>
    api<ActionResult>(`/api/openclaw/sessions/${key}/reset`, { method: "POST" }),
  deleteSession: (key: string) =>
    api<ActionResult>(`/api/openclaw/sessions/${key}`, { method: "DELETE" }),
  sessionHistory: (agentId: string, sessionId: string) =>
    api<SessionHistoryResponse>(`/api/openclaw/agents/${agentId}/sessions/${sessionId}/history`),
  // Workspace skills (SKILL.md)
  projectSkills: () =>
    api<WorkspaceSkill[]>(`/api/openclaw/project-skills`),
  workspaceSkills: (agentId: string) =>
    api<WorkspaceSkillsList>(`/api/openclaw/agents/${agentId}/workspace-skills`),
  getWorkspaceSkill: (agentId: string, slug: string) =>
    api<WorkspaceSkill>(`/api/openclaw/agents/${agentId}/workspace-skills/${slug}`),
  createWorkspaceSkill: (agentId: string, payload: { name: string; description?: string; instructions?: string; metadata?: Record<string, unknown> }) =>
    api<WorkspaceSkill>(`/api/openclaw/agents/${agentId}/workspace-skills`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspaceSkill: (agentId: string, slug: string, content: string) =>
    api<WorkspaceSkill>(`/api/openclaw/agents/${agentId}/workspace-skills/${slug}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteWorkspaceSkill: (agentId: string, slug: string) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}/workspace-skills/${slug}`, {
      method: "DELETE",
    }),
  deployProjectSkill: (agentId: string, slug: string) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}/workspace-skills/deploy`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
  unlinkProjectSkill: (agentId: string, slug: string) =>
    api<ActionResult>(`/api/openclaw/agents/${agentId}/workspace-skills/unlink`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
};

// Workspace skills (SKILL.md files)
export interface WorkspaceSkill {
  name: string;
  slug: string;
  description: string;
  metadata: Record<string, unknown>;
  content: string;
  location: "workspace" | "project" | "managed";
  agent_id: string | null;
  path: string;
  is_symlink: boolean;
}

export interface WorkspaceSkillsList {
  workspace_skills: WorkspaceSkill[];
  project_skills: WorkspaceSkill[];
  managed_skills: WorkspaceSkill[];
}

// App health
export const appHealth = () => api<AppHealth>("/health");

// ── Costing types ───────────────────────────────────────────────────

export interface CostingModelBreakdown {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_count: number;
  estimated_cost_usd: number;
}

export interface CostingAgentBreakdown {
  agent_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_count: number;
  estimated_cost_usd: number;
}

export interface CostingSessionDetail {
  session_key: string;
  session_id: string;
  agent_id: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  title: string | null;
  updated_at: number | null;
}

export interface CostingSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  session_count: number;
  by_model: CostingModelBreakdown[];
  by_agent: CostingAgentBreakdown[];
  sessions: CostingSessionDetail[];
  computed_at: string;
}

// WebSocket URL for chat
export function chatWsUrl(agentId: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/api/chat/${agentId}`;
}

// ── Secrets Manager types ───────────────────────────────────────────

export type SecretSource = "env" | "file" | "exec";

export interface SecretRef {
  source: SecretSource;
  provider: string;
  id: string;
}

export interface SecretProviderConfig {
  source: SecretSource;
  // env-specific
  allowlist?: string[];
  // file-specific
  path?: string;
  mode?: "json" | "singleValue";
  allowInsecurePath?: boolean;
  // exec-specific
  command?: string;
  args?: string[];
  passEnv?: string[];
  jsonOnly?: boolean;
  allowSymlinkCommand?: boolean;
  trustedDirs?: string[];
  timeoutMs?: number;
}

export interface SecretProvider {
  name: string;
  source: SecretSource;
  config: SecretProviderConfig;
}

export interface ProviderDefaults {
  env: string;
  file: string | null;
  exec: string | null;
}

export interface ProvidersListResponse {
  providers: SecretProvider[];
  defaults: ProviderDefaults;
}

export interface SecretRefResponse {
  field: string;
  ref: SecretRef;
  agent_id: string | null;
  resolved: boolean;
  active: boolean;
  error: string | null;
}

export interface SecretRefListResponse {
  refs: SecretRefResponse[];
}

export type SnapshotState =
  | "uninitialized"
  | "healthy"
  | "degraded"
  | "failed";

export interface SecretsSnapshotStatus {
  state: SnapshotState;
  resolved_count: number;
  unresolved_count: number;
  last_activated_at: string | null;
  last_error: string | null;
  degraded_since: string | null;
}

export interface ReloadResponse {
  success: boolean;
  state: SnapshotState;
  resolved_count: number;
  unresolved_count: number;
  errors: Record<string, string>;
  message: string;
}

export type AuditSeverity = "info" | "warning" | "error";

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  message: string;
  field: string | null;
  file: string | null;
}

export interface AuditResponse {
  clean: boolean;
  findings: AuditFinding[];
  summary: string;
}

// ── Provider presets ─────────────────────────────────────────────────

export interface ProviderPresetField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret: boolean;
  help: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: SecretSource;
  category: string;
  default_provider_name: string;
  config_template: Record<string, unknown>;
  fields: ProviderPresetField[];
  docs_url: string;
  example_ref: SecretRef | null;
}

export interface ProviderPresetsResponse {
  presets: ProviderPreset[];
}

// ── Credential surface ──────────────────────────────────────────────

export type CredentialFieldStatus = "ref" | "env" | "plaintext" | "unconfigured";

export interface CredentialField {
  field: string;
  label: string;
  provider_id: string | null;
  status: CredentialFieldStatus;
  ref: SecretRef | null;
  env_var_hint: string | null;
  resolved: boolean;
}

export interface CredentialSurfaceResponse {
  fields: CredentialField[];
  total: number;
  configured: number;
  unconfigured: number;
}

// ── Secrets Manager API ─────────────────────────────────────────────

export const secretsManagerApi = {
  // Snapshot status
  status: () => api<SecretsSnapshotStatus>("/api/secrets-manager/status"),

  // Credential surface
  credentialSurface: () =>
    api<CredentialSurfaceResponse>("/api/secrets-manager/credential-surface"),
  clearAll: () =>
    api<{ cleared_refs: number; cleared_plaintext: number; cleared_env_vars: number; total_cleared: number }>(
      "/api/secrets-manager/clear-all",
      { method: "DELETE" }
    ),
  setupRef: (field: string, envVar: string, value?: string) =>
    api<SecretRefResponse>("/api/secrets-manager/setup-ref", {
      method: "POST",
      body: JSON.stringify({ field, env_var: envVar, value: value || null }),
    }),

  // Provider presets
  listPresets: () =>
    api<ProviderPresetsResponse>("/api/secrets-manager/presets"),
  createFromPreset: (
    presetId: string,
    providerName: string,
    fieldValues: Record<string, string>
  ) =>
    api<SecretProvider>("/api/secrets-manager/presets/create", {
      method: "POST",
      body: JSON.stringify({
        preset_id: presetId,
        provider_name: providerName,
        field_values: fieldValues,
      }),
    }),

  // Providers
  listProviders: () =>
    api<ProvidersListResponse>("/api/secrets-manager/providers"),
  createProvider: (name: string, config: SecretProviderConfig) =>
    api<SecretProvider>("/api/secrets-manager/providers", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    }),
  updateProvider: (name: string, config: SecretProviderConfig) =>
    api<SecretProvider>(`/api/secrets-manager/providers/${name}`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),
  deleteProvider: (name: string) =>
    api<void>(`/api/secrets-manager/providers/${name}`, { method: "DELETE" }),

  // SecretRefs
  listRefs: () => api<SecretRefListResponse>("/api/secrets-manager/refs"),
  setRef: (field: string, ref: SecretRef, agentId?: string) =>
    api<SecretRefResponse>("/api/secrets-manager/refs", {
      method: "POST",
      body: JSON.stringify({ field, ref, agent_id: agentId }),
    }),
  removeRef: (field: string) =>
    api<void>(`/api/secrets-manager/refs/${field}`, { method: "DELETE" }),

  // Resolution & reload
  reload: () =>
    api<ReloadResponse>("/api/secrets-manager/reload", { method: "POST" }),
  activate: () =>
    api<ReloadResponse>("/api/secrets-manager/activate", { method: "POST" }),

  // Audit
  audit: () => api<AuditResponse>("/api/secrets-manager/audit"),
};
