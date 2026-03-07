"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chatWsUrl, lifecycleApi, type SessionEntry } from "@/lib/api";
import type { ChatMessage, TraceEvent, AgentInfo, ToolActivity, SecretsStoreData, SkillSetupData, SkillSetupField } from "@/components/chat/types";

export interface UseAgentChatOptions {
  /** Auto-connect when agentId changes (default: true) */
  autoConnect?: boolean;
}

export interface UseAgentChatReturn {
  /* ── State ─────────────────────────────────────────────────────── */
  messages: ChatMessage[];
  traceEvents: TraceEvent[];
  connected: boolean;
  connecting: boolean;
  streaming: boolean;
  thinking: boolean;
  delegating: string | false;
  sessionKey: string | null;

  /* ── Actions ───────────────────────────────────────────────────── */
  send: (text: string) => void;
  connect: () => void;
  disconnect: () => void;
  newChat: () => void;
  selectSession: (session: SessionEntry) => void;
  storeSecret: (field: string, envVar: string, value: string, label: string) => void;
  rejectSecret: (field: string) => void;

  /* ── Refs ───────────────────────────────────────────────────────── */
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Encapsulates all WebSocket chat logic: connection lifecycle,
 * message streaming, trace events, delegation tracking, and
 * session management — leaving the consumer as a thin render shell.
 */
export function useAgentChat(
  agentId: string,
  agents: AgentInfo[] | undefined,
  options: UseAgentChatOptions = {},
): UseAgentChatReturn {
  const { autoConnect = true } = options;

  /* ── Core state ────────────────────────────────────────────────── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [delegating, setDelegating] = useState<string | false>(false);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const traceSeqRef = useRef(0);

  const [sessionKey, setSessionKey] = useState<string | null>(null);

  /* ── Refs ───────────────────────────────────────────────────────── */
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep a stable ref to current agent for use inside WS callbacks
  const currentAgent = agents?.find((a) => a.id === agentId);
  const currentAgentRef = useRef(currentAgent);
  currentAgentRef.current = currentAgent;

  // Agents ref for delegation label lookups inside WS callbacks
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Track active tool calls for building tool_activity messages
  const activeToolsRef = useRef<Map<string, { startTime: number; args: Record<string, unknown> }>>(new Map());

  /* ── Tool activity helpers ─────────────────────────────────────── */

  function extractSql(args: Record<string, unknown>): string | undefined {
    const candidates = ["query", "sql", "statement", "code", "script"];
    for (const key of candidates) {
      if (typeof args[key] === "string" && args[key]) return args[key] as string;
    }
    // Check nested
    for (const val of Object.values(args)) {
      if (typeof val === "string" && val.length > 20 && /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH|DROP|ALTER)\b/i.test(val)) {
        return val;
      }
    }
    return undefined;
  }

  function buildToolLabel(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("sql") || lower.includes("query") || lower.includes("execute")) return "SQL Query";
    if (lower.includes("read")) return "Read File";
    if (lower.includes("write")) return "Write File";
    if (lower.includes("list")) return "List Resources";
    if (lower.includes("search")) return "Search";
    return name.split(/[_.]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function handleToolStart(toolName: string, metadata: Record<string, unknown>) {
    const args = (metadata.args || metadata.input || {}) as Record<string, unknown>;
    const sql = extractSql(args);

    activeToolsRef.current.set(toolName, {
      startTime: Date.now(),
      args,
    });

    const activity: ToolActivity = {
      name: toolName,
      phase: "running",
      args,
      sql,
      label: buildToolLabel(toolName),
    };

    setMessages((prev) => [
      ...prev,
      {
        role: "tool_activity",
        content: toolName,
        timestamp: new Date(),
        toolName,
        toolPhase: "start",
        toolActivity: activity,
      },
    ]);
  }

  function handleToolEnd(toolName: string, metadata: Record<string, unknown>) {
    const tracked = activeToolsRef.current.get(toolName);
    const durationMs = tracked ? Date.now() - tracked.startTime : undefined;
    const args = tracked?.args || {};
    const sql = extractSql(args);
    const error = metadata.error as string | undefined;
    const result = metadata.result || metadata.output || metadata.partialResult;
    const resultStr = result ? String(result) : undefined;

    // Try to parse result as structured data
    let resultData: Record<string, unknown>[] | undefined;
    if (resultStr) {
      try {
        const parsed = JSON.parse(resultStr);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
          resultData = parsed;
        }
      } catch {
        // Not JSON, that's fine
      }
    }

    activeToolsRef.current.delete(toolName);

    const activity: ToolActivity = {
      name: toolName,
      phase: error ? "error" : "completed",
      args,
      sql,
      result: resultStr?.slice(0, 5000),
      resultData,
      durationMs,
      error: error ? String(error) : undefined,
      label: buildToolLabel(toolName),
    };

    // Update the existing tool_activity message for this tool
    setMessages((prev) => {
      // Find the last running tool_activity for this tool name
      const idx = [...prev].reverse().findIndex(
        (m) => m.role === "tool_activity" && m.toolName === toolName && m.toolActivity?.phase === "running",
      );
      if (idx >= 0) {
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = {
          ...updated[realIdx],
          toolPhase: "end",
          toolActivity: activity,
        };
        return updated;
      }
      // No matching start — insert standalone
      return [
        ...prev,
        {
          role: "tool_activity",
          content: toolName,
          timestamp: new Date(),
          toolName,
          toolPhase: "end",
          toolActivity: activity,
        },
      ];
    });
  }

  /* ── Streaming helpers ─────────────────────────────────────────── */

  /** Strip setup_skill / store_secret fenced blocks from assistant text */
  function stripActionBlocks(text: string): string {
    return text.replace(/```(?:setup_skill|store_secret)\s*\n[\s\S]*?\n```/g, "").trim();
  }

  function appendAssistantDelta(delta: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          content: last.content + delta,
        };
        return updated;
      }
      return [
        ...prev,
        {
          role: "assistant",
          content: delta,
          timestamp: new Date(),
          streaming: true,
        },
      ];
    });
  }

  function finalizeAssistant() {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        const cleaned = stripActionBlocks(last.content);
        const updated = [...prev];
        if (!cleaned) {
          // Nothing left after stripping — remove the empty assistant bubble
          updated.pop();
        } else {
          updated[updated.length - 1] = { ...last, content: cleaned, streaming: false };
        }
        return updated;
      }
      return prev;
    });
    setStreaming(false);
  }

  /* ── WebSocket lifecycle ───────────────────────────────────────── */

  const connect = useCallback(() => {
    if (!agentId) return;
    setConnecting(true);
    const ws = new WebSocket(chatWsUrl(agentId));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      const a = currentAgentRef.current;
      const label = a
        ? `${a.emoji || ""} ${a.name || a.id}`.trim()
        : "your agent";
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Connected to ${label}`,
          timestamp: new Date(),
        },
      ]);
      inputRef.current?.focus();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type: string = data.type ?? "text";
        const content: string = data.content ?? data.text ?? "";

        /* ── Trace events ─────────────────────────────────────────── */
        if (type === "trace") {
          const evtStream = data.stream ?? "";
          const evtData = data.data ?? {};

          setTraceEvents((prev) => {
            const evtPhase = data.phase ?? "?";
            const isAssistantDelta =
              evtStream === "assistant" && evtData.delta != null;

            if (isAssistantDelta) {
              const last = prev[prev.length - 1];
              const sameGroup =
                last &&
                last.stream === evtStream &&
                last.phase === evtPhase &&
                last.data.delta != null;
              if (sameGroup) {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  ts: data.ts ?? last.ts,
                  data: {
                    ...last.data,
                    delta:
                      (last.data.delta ?? "") + (evtData.delta ?? ""),
                    tokens: (last.data.tokens ?? 1) + 1,
                  },
                };
                return updated;
              }
              return [
                ...prev,
                {
                  id: ++traceSeqRef.current,
                  ts: data.ts ?? Date.now(),
                  phase: evtPhase,
                  runId: data.run_id ?? "",
                  stream: evtStream,
                  data: { ...evtData, tokens: 1 },
                },
              ];
            }

            return [
              ...prev,
              {
                id: ++traceSeqRef.current,
                ts: data.ts ?? Date.now(),
                phase: data.phase ?? "?",
                runId: data.run_id ?? "",
                stream: evtStream,
                data: evtData,
              },
            ];
          });
          return;
        }

        /* ── Chat message events ──────────────────────────────────── */
        const currentAgents = agentsRef.current;

        if (type === "delegation_status") {
          const targetId: string = data.target_agent ?? "";
          if (content === "waiting" && targetId && targetId !== agentId) {
            const targetAgent = currentAgents?.find(
              (a) => a.id === targetId,
            );
            const label = targetAgent
              ? `${targetAgent.emoji ? targetAgent.emoji + " " : ""}${targetAgent.name || targetId}`
              : targetId || "sub-agent";
            setDelegating(label);
          } else {
            setDelegating(false);
          }
          return;
        }

        if (type === "text") {
          setStreaming(true);
          setThinking(false);
          setDelegating(false);
          appendAssistantDelta(content);
        } else if (type === "tool_start") {
          // Only show delegation UI when spawning a *different* agent.
          // Skill execution also uses sessions_spawn but targets the same
          // agent (or has no target), so we exclude those.
          const isSpawnTool =
            content.toLowerCase().includes("sessions_spawn") ||
            content.toLowerCase().includes("spawn");
          const targetId = data.target_agent ?? "";
          const isDelegation =
            isSpawnTool && !!targetId && targetId !== agentId;
          if (isDelegation) {
            const targetAgent = currentAgents?.find(
              (a) => a.id === targetId,
            );
            const label = targetAgent
              ? `${targetAgent.emoji ? targetAgent.emoji + " " : ""}${targetAgent.name || targetId}`
              : targetId || "sub-agent";
            setDelegating(label);
            setMessages((prev) => [
              ...prev,
              {
                role: "delegation",
                content,
                timestamp: new Date(),
                toolName: content,
                toolPhase: "start",
              },
            ]);
          } else {
            // Show tool activity inline in chat for non-delegation tools
            const toolName = data.metadata?.name || data.metadata?.tool || content.split(":")[0].trim();
            handleToolStart(toolName, data.metadata || {});
          }
        } else if (type === "tool_end") {
          // Update delegation bubbles
          setMessages((prev) => {
            const idx = [...prev]
              .reverse()
              .findIndex(
                (m) =>
                  m.role === "delegation" &&
                  m.toolPhase === "start" &&
                  m.toolName === content,
              );
            if (idx >= 0) {
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              updated[realIdx] = {
                ...updated[realIdx],
                toolPhase: "end",
              };
              return updated;
            }
            return prev;
          });
          // Update tool activity card
          const toolName = data.metadata?.name || data.metadata?.tool || content.split(":")[0].trim();
          handleToolEnd(toolName, data.metadata || {});
        } else if (type === "tool_update") {
          // Intermediate update — could carry partial result data
          // No-op for now; the card stays in "running" state
        } else if (type === "status") {
          const isTerminal =
            content === "completed" || content.startsWith("failed");
          if (isTerminal) {
            setThinking(false);
            finalizeAssistant();
            // Show error details if the run failed
            if (content.startsWith("failed")) {
              const errorDetail = content.replace(/^failed:\s*/, "").trim();
              if (errorDetail && errorDetail !== "failed") {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "system",
                    content: `Error: ${errorDetail}`,
                    timestamp: new Date(),
                  },
                ]);
              }
            }
          }
        } else if (type === "system") {
          finalizeAssistant();
          const isWaiting =
            content.includes("sub-agent") ||
            content.includes("Sub-agent") ||
            content.includes("Waiting");
          if (isWaiting) {
            setMessages((prev) => {
              const hasDeleg = prev.some(
                (m) => m.role === "delegation",
              );
              if (hasDeleg) return prev;
              return [
                ...prev,
                {
                  role: "delegation",
                  content,
                  timestamp: new Date(),
                },
              ];
            });
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "system", content, timestamp: new Date() },
            ]);
          }
        } else if (type === "error") {
          setThinking(false);
          finalizeAssistant();
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `Error: ${content}`,
              timestamp: new Date(),
            },
          ]);
        } else if (type === "secrets_store_offer") {
          // Agent offers to store a credential
          const storeData: SecretsStoreData = {
            field: data.field ?? "",
            envVar: data.env_var ?? "",
            value: data.value ?? "",
            label: data.label ?? "",
            status: "pending",
          };
          setMessages((prev) => [
            ...prev,
            {
              role: "secrets_store",
              content: `Store credential: ${storeData.label}`,
              timestamp: new Date(),
              secretsStore: storeData,
            },
          ]);
        } else if (type === "secrets_stored") {
          // Update existing secrets_store message with stored status
          const field = data.field ?? "";
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "secrets_store" &&
              m.secretsStore?.field === field &&
              m.secretsStore?.status === "pending"
                ? {
                    ...m,
                    secretsStore: {
                      ...m.secretsStore!,
                      status: "stored",
                    },
                  }
                : m,
            ),
          );
        } else if (type === "skill_setup") {
          // Skill setup form — render the input card (dedup by skill name)
          const skillName = data.skill ?? "";
          const alreadyShown = (prev: ChatMessage[]) =>
            prev.some(
              (m) =>
                m.role === "skill_setup" &&
                m.skillSetup?.skill === skillName &&
                m.skillSetup?.status === "pending",
            );
          const fields: SkillSetupField[] = (data.fields ?? []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (f: any) => ({
              envVar: f.env_var ?? "",
              label: f.label ?? f.env_var ?? "",
              placeholder: f.placeholder ?? "",
              optional: f.optional ?? false,
              configured: f.configured ?? false,
            }),
          );
          const setupData: SkillSetupData = {
            skill: data.skill ?? "",
            fields,
            status: "pending",
          };
          setMessages((prev) => {
            if (alreadyShown(prev)) return prev;
            return [
              ...prev,
              {
                role: "skill_setup",
                content: `Configure ${setupData.skill} credentials`,
                timestamp: new Date(),
                skillSetup: setupData,
              },
            ];
          });
        }
      } catch {
        appendAssistantDelta(event.data);
      }
    };

    ws.onclose = () => {
      finalizeAssistant();
      setConnected(false);
      setConnecting(false);
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "Disconnected",
          timestamp: new Date(),
        },
      ]);
    };

    ws.onerror = () => {
      finalizeAssistant();
      setConnected(false);
      setConnecting(false);
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "Connection failed — is the gateway running?",
          timestamp: new Date(),
        },
      ]);
    };
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const storeSecret = useCallback(
    (field: string, envVar: string, value: string, label: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({
          type: "store_secret",
          field,
          env_var: envVar,
          value,
          label,
        }),
      );
    },
    [],
  );

  const rejectSecret = useCallback(
    (field: string) => {
      // Just update local state — no need to tell backend
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "secrets_store" &&
          m.secretsStore?.field === field &&
          m.secretsStore?.status === "pending"
            ? {
                ...m,
                secretsStore: {
                  ...m.secretsStore!,
                  status: "rejected" as const,
                },
              }
            : m,
        ),
      );
    },
    [],
  );

  const newChat = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
    setMessages([]);
    setStreaming(false);
    setThinking(false);
    setDelegating(false);
    setTraceEvents([]);
    traceSeqRef.current = 0;
    activeToolsRef.current.clear();
    setSessionKey(null);
    setTimeout(() => connect(), 100);
  }, [connect]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (
        !trimmed ||
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN
      )
        return;
      finalizeAssistant();
      setThinking(true);
      const payload: Record<string, string> = { message: trimmed };
      if (sessionKey) payload.session_key = sessionKey;
      wsRef.current.send(JSON.stringify(payload));
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, timestamp: new Date() },
      ]);
    },
    [sessionKey],
  );

  const selectSession = useCallback(
    (session: SessionEntry) => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setConnecting(false);
      setMessages([
        {
          role: "system",
          content: `Resuming session: ${session.derived_title || session.display_name || "Untitled"}`,
          timestamp: new Date(),
        },
      ]);
      setStreaming(false);
      setThinking(false);
      setDelegating(false);
      setTraceEvents([]);
      traceSeqRef.current = 0;
      setSessionKey(session.key);

      // Load session history before reconnecting
      const historyId = session.session_id || session.key;
      if (historyId && agentId) {
        lifecycleApi
          .sessionHistory(agentId, historyId)
          .then((resp) => {
            if (resp.messages && resp.messages.length > 0) {
              const historyMsgs: ChatMessage[] = resp.messages.map((m) => ({
                role: (m.role === "user" || m.role === "assistant"
                  ? m.role
                  : "system") as ChatMessage["role"],
                content: m.content,
                timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
              }));
              setMessages((prev) => {
                const systemMsgs = prev.filter((m) => m.role === "system");
                return [...systemMsgs, ...historyMsgs];
              });
            } else if (session.session_id && session.session_id !== session.key) {
              // Retry with key if session_id returned no results
              return lifecycleApi
                .sessionHistory(agentId, session.key)
                .then((resp2) => {
                  if (resp2.messages && resp2.messages.length > 0) {
                    const historyMsgs: ChatMessage[] = resp2.messages.map((m) => ({
                      role: (m.role === "user" || m.role === "assistant"
                        ? m.role
                        : "system") as ChatMessage["role"],
                      content: m.content,
                      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                    }));
                    setMessages((prev) => {
                      const systemMsgs = prev.filter((m) => m.role === "system");
                      return [...systemMsgs, ...historyMsgs];
                    });
                  }
                });
            }
          })
          .catch((err) => {
            console.warn("Failed to load session history:", err);
          })
          .finally(() => {
            setTimeout(() => connect(), 100);
          });
      } else {
        setTimeout(() => connect(), 100);
      }
    },
    [connect, agentId],
  );

  /* ── Auto-connect on agent change ──────────────────────────────── */
  useEffect(() => {
    if (!autoConnect) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
    if (agentId && !connecting) connect();
  }, [agentId, connect, autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cleanup on unmount ────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    messages,
    traceEvents,
    connected,
    connecting,
    streaming,
    thinking,
    delegating,
    sessionKey,
    send,
    connect,
    disconnect,
    newChat,
    selectSession,
    storeSecret,
    rejectSecret,
    inputRef,
  };
}
