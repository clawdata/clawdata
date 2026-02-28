"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  fetcher,
  templateApi,
  type BrowseResponse,
  type FileTreeEntry,
  type FileContentResponse,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileCode2,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  File,
  FileJson,
  FileText,
  Database,
  Wind,
  Code2,
  Braces,
  Search,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ── Helpers ────────────────────────────────────────────────────── */

const FOLDER_COLORS: Record<string, string> = {
  dbt: "text-orange-500",
  airflow: "text-sky-500",
  sql: "text-emerald-500",
  sampledata: "text-amber-500",
};

const FOLDER_ICONS: Record<string, typeof FileCode2> = {
  dbt: Database,
  airflow: Wind,
  sql: Code2,
  sampledata: FileSpreadsheet,
};

function folderColor(name: string): string {
  return FOLDER_COLORS[name] ?? "text-purple-500";
}

function folderIcon(name: string, open: boolean) {
  const Icon = FOLDER_ICONS[name];
  if (Icon) return Icon;
  return open ? FolderOpen : Folder;
}

function fileIconForName(name: string) {
  if (name.endsWith(".json")) return FileJson;
  if (name.endsWith(".csv")) return FileSpreadsheet;
  if (name.endsWith(".md") || name.endsWith(".txt")) return FileText;
  if (name.endsWith(".sql.j2") || name.endsWith(".sql")) return Code2;
  if (name.endsWith(".yml.j2") || name.endsWith(".yml") || name.endsWith(".yaml")) return Braces;
  if (name.endsWith(".py.j2") || name.endsWith(".py")) return FileCode2;
  return File;
}

function langForFile(name: string): string {
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "text";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".sql.j2") || name.endsWith(".sql")) return "sql";
  if (name.endsWith(".yml.j2") || name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
  if (name.endsWith(".py.j2") || name.endsWith(".py")) return "python";
  return "text";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countFiles(entries: FileTreeEntry[]): number {
  let c = 0;
  for (const e of entries) {
    if (e.type === "file") c++;
    else if (e.children) c += countFiles(e.children);
  }
  return c;
}

function filterTree(entries: FileTreeEntry[], q: string): FileTreeEntry[] {
  if (!q) return entries;
  const lower = q.toLowerCase();
  const result: FileTreeEntry[] = [];
  for (const e of entries) {
    if (e.type === "file") {
      if (e.name.toLowerCase().includes(lower) || e.path.toLowerCase().includes(lower)) {
        result.push(e);
      }
    } else {
      const children = filterTree(e.children ?? [], q);
      if (children.length > 0 || e.name.toLowerCase().includes(lower)) {
        result.push({ ...e, children });
      }
    }
  }
  return result;
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function TemplatesPage() {
  const { data: browseData, mutate } = useSWR<BrowseResponse>(
    "/api/templates/browse",
    fetcher,
    { revalidateOnFocus: true }
  );

  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FileContentResponse | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["dbt", "airflow", "sql", "sampledata"])
  );

  const tree = browseData?.tree ?? [];
  const filtered = filterTree(tree, search);
  const totalFiles = countFiles(tree);

  const selectFile = useCallback(
    async (entry: FileTreeEntry) => {
      if (entry.type !== "file") return;
      setActivePath(entry.path);
      setLoadingFile(true);
      try {
        const content = await templateApi.readFile(entry.path);
        setActiveFile(content);
      } catch {
        toast.error("Failed to read file");
        setActiveFile(null);
      } finally {
        setLoadingFile(false);
      }
    },
    []
  );

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await mutate();
      toast.success("Refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[calc(100vh-6rem)] flex-col gap-0">
        <div className="flex flex-1 overflow-hidden rounded-lg border bg-card">
          {/* LEFT: File Tree */}
          <div className="flex w-72 shrink-0 flex-col border-r bg-muted/30">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Templates
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={cn("h-3 w-3", refreshing && "animate-spin")}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
            </div>

            <div className="px-2 py-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter files…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs bg-background"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-1 pb-2">
                {!browseData ? (
                  <div className="space-y-2 px-2 pt-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 rounded bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <FileCode2 className="mx-auto h-6 w-6 text-muted-foreground/40" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {search ? "No matches" : "Empty"}
                    </p>
                  </div>
                ) : (
                  <TreeNodes
                    entries={filtered}
                    depth={0}
                    expanded={expandedFolders}
                    onToggle={toggleFolder}
                    activePath={activePath}
                    onSelect={selectFile}
                  />
                )}
              </div>
            </ScrollArea>

            <div className="border-t px-3 py-1.5">
              <p className="text-[10px] text-muted-foreground">
                {totalFiles} file{totalFiles !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* RIGHT: Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!activeFile && !loadingFile ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <FileCode2 className="mx-auto h-12 w-12 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Select a file from the sidebar
                  </p>
                </div>
              </div>
            ) : loadingFile ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : activeFile ? (
              <>
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">
                      {activeFile.name}
                    </h2>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {activeFile.path}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {formatSize(activeFile.size)}
                  </span>
                </div>

                <div className="flex-1 overflow-hidden">
                  <ContentViewer
                    code={activeFile.content}
                    language={langForFile(activeFile.name)}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function TreeNodes({
  entries,
  depth,
  expanded,
  onToggle,
  activePath,
  onSelect,
}: {
  entries: FileTreeEntry[];
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  activePath: string | null;
  onSelect: (entry: FileTreeEntry) => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.type === "folder") {
          const isExpanded = expanded.has(entry.path);
          const FolderIcon = folderIcon(entry.name, isExpanded);
          const color = folderColor(entry.name);
          const fileCount = countFiles(entry.children ?? []);

          return (
            <div key={entry.path}>
              <button
                onClick={() => onToggle(entry.path)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-accent/50 transition-colors"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <FolderIcon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                <span className="truncate">{entry.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {fileCount}
                </span>
              </button>
              {isExpanded && entry.children && (
                <div className="border-l border-border/50" style={{ marginLeft: `${depth * 12 + 16}px` }}>
                  <TreeNodes
                    entries={entry.children}
                    depth={depth + 1}
                    expanded={expanded}
                    onToggle={onToggle}
                    activePath={activePath}
                    onSelect={onSelect}
                  />
                </div>
              )}
            </div>
          );
        }

        const FileIcon = fileIconForName(entry.name);
        const isActive = activePath === entry.path;

        return (
          <button
            key={entry.path}
            onClick={() => onSelect(entry)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <FileIcon className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1 text-left">{entry.name}</span>
            {entry.size !== undefined && (
              <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
                {formatSize(entry.size)}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function ContentViewer({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative h-full">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 z-10 h-7 w-7 bg-background/60 backdrop-blur-sm"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <ScrollArea className="h-full">
        <SyntaxHighlighter
          language={language}
          style={resolvedTheme === "dark" ? oneDark : undefined}
          customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.8rem",
            lineHeight: "1.6",
            background: resolvedTheme === "dark" ? undefined : "transparent",
            borderRadius: 0,
            minHeight: "100%",
          }}
          showLineNumbers
          lineNumberStyle={{
            minWidth: "2.5em",
            opacity: 0.3,
            fontSize: "0.7rem",
          }}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </ScrollArea>
    </div>
  );
}
