"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chatWsUrl, type SessionEntry } from "@/lib/api";
import type { ChatMessage, TraceEvent, AgentInfo } from "@/components/chat/types";

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

  /* ── Streaming helpers ─────────────────────────────────────────── */

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
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, streaming: false };
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
          }
          // Non-delegation tools: no chat bubble — visible in trace panel
        } else if (type === "tool_end") {
          // Update delegation bubbles only
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
      setTimeout(() => connect(), 100);
    },
    [connect],
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
    inputRef,
  };
}
