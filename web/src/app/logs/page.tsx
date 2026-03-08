"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import {
  fetcher,
  api,
  type GatewayLogResponse,
  type SessionEntry,
  type SessionsResponse,
  type SessionHistoryResponse,
  type OpenClawAgentsList,
} from "@/lib/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Terminal,
  Search,
  RefreshCw,
  Download,
  ArrowDown,
  ArrowUp,
  Bot,
  Hash,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  Bug,
  MessageSquare,
  User,
  Wrench,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatTimeShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Log level styling ───────────────────────────────────────────── */

const LOG_LEVEL_CONFIG: Record<string, { color: string; icon: typeof Info; badge: string }> = {
  ERROR: { color: "text-red-400", icon: AlertTriangle, badge: "bg-red-500/20 text-red-400 border-red-500/30" },
  FATAL: { color: "text-red-400", icon: AlertTriangle, badge: "bg-red-500/20 text-red-400 border-red-500/30" },
  WARN: { color: "text-amber-400", icon: AlertTriangle, badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  WARNING: { color: "text-amber-400", icon: AlertTriangle, badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  INFO: { color: "text-sky-300", icon: Info, badge: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  DEBUG: { color: "text-slate-500", icon: Bug, badge: "bg-slate-500/20 text-slate-500 border-slate-500/30" },
  SILLY: { color: "text-slate-600", icon: Bug, badge: "bg-slate-600/20 text-slate-600 border-slate-600/30" },
};

function getLevelConfig(level: string) {
  return LOG_LEVEL_CONFIG[level.toUpperCase()] || LOG_LEVEL_CONFIG.INFO;
}

/* ── Event type colors ───────────────────────────────────────────── */

/* ── Gateway Logs Tab ────────────────────────────────────────────── */

function GatewayLogsPanel() {
  const [lines, setLines] = useState(500);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const { data, isLoading, mutate } = useSWR<GatewayLogResponse>(
    `/api/logs/gateway?lines=${lines}`,
    fetcher,
    {
      refreshInterval: autoRefresh ? 5000 : 0,
      revalidateOnFocus: false,
    }
  );

  const entries = useMemo(() => data?.entries || [], [data?.entries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (levelFilter !== "all") {
      result = result.filter((e) => e.level.toUpperCase() === levelFilter);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.timestamp && e.timestamp.toLowerCase().includes(q))
      );
    }
    return result;
  }, [entries, filter, levelFilter]);

  // Level counts for filter badges
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const lvl = e.level.toUpperCase();
      counts[lvl] = (counts[lvl] || 0) + 1;
    }
    return counts;
  }, [entries]);

  // Scroll to top on initial load (not bottom)
  useEffect(() => {
    if (!initialScrollDone.current && filteredEntries.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      initialScrollDone.current = true;
    }
  }, [filteredEntries.length]);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const downloadLogs = () => {
    if (!data?.raw_output) return;
    const blob = new Blob([data.raw_output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openclaw-gateway-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-50 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter log messages..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {["ERROR", "WARN", "INFO", "DEBUG"].map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                <span className="flex items-center gap-2">
                  <span className={getLevelConfig(lvl).color}>{lvl}</span>
                  {levelCounts[lvl] ? (
                    <span className="text-muted-foreground text-[10px]">({levelCounts[lvl]})</span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(lines)}
          onValueChange={(v) => setLines(Number(v))}
        >
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="500">500</SelectItem>
            <SelectItem value="1000">1K</SelectItem>
            <SelectItem value="5000">5K</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
          className="h-9"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", autoRefresh && "animate-spin")} />
          {autoRefresh ? "Live" : "Paused"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => mutate()} className="h-9">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={downloadLogs} className="h-9">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export
        </Button>
      </div>

      {/* Log viewer */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="bg-[#0d1117] rounded-lg border border-slate-800 font-mono text-xs overflow-auto"
          style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}
        >
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-4 bg-slate-800" style={{ width: `${60 + (i * 7) % 40}%` }} />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <Terminal className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {filter || levelFilter !== "all"
                    ? "No matching log lines"
                    : "No gateway logs available"}
                </p>
                <p className="text-xs mt-1 text-slate-600">
                  {filter || levelFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Start the OpenClaw gateway to see logs"}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-1">
              {/* Header row */}
              <div className="flex items-center px-2 py-1.5 text-[10px] text-slate-600 uppercase tracking-wider border-b border-slate-800/50 mb-1 sticky top-0 bg-[#0d1117] z-10">
                <span className="w-8 text-right mr-2 shrink-0">#</span>
                <span className="w-20 mr-2 shrink-0">Time</span>
                <span className="w-14 mr-2 shrink-0">Level</span>
                <span className="flex-1">Message</span>
              </div>
              {filteredEntries.map((entry) => {
                const cfg = getLevelConfig(entry.level);
                return (
                  <div
                    key={entry.line_number}
                    className={cn(
                      "flex items-start py-0.5 px-2 hover:bg-white/3 rounded group",
                      entry.level.toUpperCase() === "ERROR" && "bg-red-500/4",
                      entry.level.toUpperCase() === "WARN" && "bg-amber-500/2"
                    )}
                  >
                    <span className="w-8 text-right mr-2 shrink-0 text-slate-600 select-none tabular-nums">
                      {entry.line_number}
                    </span>
                    <span className="w-20 mr-2 shrink-0 text-slate-500 tabular-nums">
                      {formatTimeShort(entry.timestamp)}
                    </span>
                    <span className={cn("w-14 mr-2 shrink-0 font-semibold text-[10px] pt-px", cfg.color)}>
                      {entry.level.toUpperCase().slice(0, 5)}
                    </span>
                    <span
                      className={cn(
                        "flex-1 whitespace-pre-wrap break-all leading-5",
                        cfg.color,
                        entry.level.toUpperCase() === "DEBUG" && "opacity-70"
                      )}
                    >
                      {entry.message}
                    </span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        {filteredEntries.length > 0 && (
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg h-7 px-2"
              onClick={scrollToTop}
            >
              <ArrowUp className="h-3.5 w-3.5 mr-1" />
              Top
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg h-7 px-2"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-3.5 w-3.5 mr-1" />
              Latest
            </Button>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{filteredEntries.length} lines shown</span>
        {(filter || levelFilter !== "all") && <span>({entries.length} total)</span>}
        {data?.log_file && (
          <span className="font-mono text-[10px] text-muted-foreground/60 truncate max-w-xs">
            {data.log_file}
          </span>
        )}
        {autoRefresh && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Auto-refreshing every 5s
          </span>
        )}
        {/* Level summary pills */}
        {entries.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            {(["ERROR", "WARN", "INFO", "DEBUG"] as const).map((lvl) => {
              const count = levelCounts[lvl] || 0;
              if (count === 0) return null;
              const cfg = getLevelConfig(lvl);
              return (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(levelFilter === lvl ? "all" : lvl)}
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors",
                    levelFilter === lvl ? cfg.badge : "border-transparent text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {lvl.slice(0, 3)} {count}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Chat History Tab ────────────────────────────────────────────── */

function ChatHistoryPanel() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Get agents list
  const { data: agentsData } = useSWR<OpenClawAgentsList>(
    "/api/connection/agents",
    fetcher
  );
  const agentIds = useMemo(
    () => (agentsData?.agents || []).map((a) => a.id),
    [agentsData]
  );

  // Fetch sessions for each agent and merge
  const sessionKeys = agentIds.map(
    (id) => `/api/connection/agents/${id}/sessions`
  );
  const { data: sessionsArrays, isLoading: sessionsLoading } = useSWR<
    SessionsResponse[]
  >(
    sessionKeys.length > 0 ? sessionKeys : null,
    async () => {
      const results = await Promise.all(
        agentIds.map((id) =>
          api<SessionsResponse>(`/api/connection/agents/${id}/sessions`).catch(
            () => ({ count: 0, sessions: [] })
          )
        )
      );
      return results;
    },
    { refreshInterval: 30000 }
  );

  // Merge all sessions with agent ID attached, sorted by updated_at desc
  const allSessions = useMemo(() => {
    if (!sessionsArrays) return [];
    const merged: (SessionEntry & { _agentId: string })[] = [];
    sessionsArrays.forEach((sr, i) => {
      for (const s of sr.sessions) {
        merged.push({ ...s, _agentId: agentIds[i] });
      }
    });
    merged.sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
    return merged;
  }, [sessionsArrays, agentIds]);

  const filteredSessions = useMemo(() => {
    let result = allSessions;
    if (agentFilter !== "all") {
      result = result.filter((s) => s._agentId === agentFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          (s.derived_title && s.derived_title.toLowerCase().includes(q)) ||
          (s.last_message_preview && s.last_message_preview.toLowerCase().includes(q)) ||
          s.display_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allSessions, agentFilter, search]);

  const loadHistory = async (agentId: string, sessionId: string, key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      setHistory(null);
      return;
    }
    setExpandedKey(key);
    setHistory(null);
    setHistoryLoading(true);
    try {
      const data = await api<SessionHistoryResponse>(
        `/api/connection/agents/${agentId}/sessions/${sessionId}/history`
      );
      setHistory(data);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const totalTokens = allSessions.reduce((s, x) => s + x.total_tokens, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>
            {allSessions.length} conversation{allSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hash className="h-3.5 w-3.5" />
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
        {agentIds.length > 1 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            <span>{agentIds.length} agents</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-50 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {agentIds.length > 1 && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agentIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Sessions list */}
      <div className="space-y-2">
        {sessionsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {search ? "No matching conversations" : "No chat sessions yet"}
            </p>
            <p className="text-xs mt-1">
              {search
                ? "Try adjusting your search"
                : "Start a conversation in the Chat tab to see history here"}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isExpanded = expandedKey === session.key;
            return (
              <div key={session.key} className="border rounded-lg overflow-hidden">
                {/* Session header */}
                <button
                  className={cn(
                    "w-full text-left p-3 hover:bg-muted/30 transition-colors",
                    isExpanded && "bg-muted/20 border-b"
                  )}
                  onClick={() =>
                    loadHistory(session._agentId, session.session_id, session.key)
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <p className="text-sm font-medium truncate">
                          {session.derived_title || session.display_name}
                        </p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {session._agentId}
                        </Badge>
                      </div>
                      {session.last_message_preview && (
                        <p className="text-xs text-muted-foreground truncate ml-5.5 pl-px">
                          {session.last_message_preview}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-muted-foreground">
                        {relativeTime(session.updated_at)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                        {session.total_tokens.toLocaleString()} tokens
                      </p>
                    </div>
                  </div>
                </button>

                {/* Expanded message history */}
                {isExpanded && (
                  <div className="max-h-96 overflow-auto bg-muted/10">
                    {historyLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading messages...
                      </div>
                    ) : !history || history.messages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">
                        No messages in this session
                      </div>
                    ) : (
                      <div className="divide-y">
                        {history.messages.map((msg, i) => {
                          const isUser = msg.role === "user";
                          const isTool = msg.role === "tool" || !!msg.tool_name;
                          const isAssistant = msg.role === "assistant";
                          return (
                            <div
                              key={i}
                              className={cn(
                                "px-4 py-2.5 text-xs",
                                isUser && "bg-blue-500/5",
                                isTool && "bg-amber-500/5",
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {isUser && <User className="h-3 w-3 text-blue-500" />}
                                {isAssistant && <Bot className="h-3 w-3 text-emerald-500" />}
                                {isTool && <Wrench className="h-3 w-3 text-amber-500" />}
                                <span
                                  className={cn(
                                    "font-medium text-[11px] uppercase tracking-wider",
                                    isUser && "text-blue-500",
                                    isAssistant && "text-emerald-500",
                                    isTool && "text-amber-500",
                                    !isUser && !isAssistant && !isTool && "text-muted-foreground"
                                  )}
                                >
                                  {msg.tool_name || msg.role}
                                </span>
                                {msg.timestamp && (
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {formatTimeShort(msg.timestamp)}
                                  </span>
                                )}
                              </div>
                              <div className="pl-5 whitespace-pre-wrap wrap-break-word text-foreground/80 leading-relaxed max-h-40 overflow-auto">
                                {msg.content.slice(0, 2000)}
                                {msg.content.length > 2000 && (
                                  <span className="text-muted-foreground">
                                    ... ({msg.content.length.toLocaleString()} chars)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function LogsPage() {
  const [tab, setTab] = useState("chat");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs"
        description="Chat history and gateway logs"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Chat History
          </TabsTrigger>
          <TabsTrigger value="gateway" className="gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            Gateway Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <ChatHistoryPanel />
        </TabsContent>

        <TabsContent value="gateway">
          <GatewayLogsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
