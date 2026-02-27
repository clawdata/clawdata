"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Puzzle,
  FileCode2,
  Settings,
  SlidersHorizontal,
  Sun,
  Moon,
  Monitor,
  Plus,
  Key,
  Brain,
} from "lucide-react";
import { useTheme } from "next-themes";
import { ApiKeysDialog } from "@/components/openclaw/api-keys-dialog";
import { ModelSelectorDialog } from "@/components/openclaw/model-selector-dialog";
import { AgentEmoji } from "@/components/agent-emoji";

interface AgentItem {
  id: string;
  name?: string;
  emoji?: string;
}

interface AgentsResponse {
  agents: AgentItem[];
}

const fetcher = (url: string) =>
  fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${url}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

const pages = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/skills", label: "Skills", icon: Puzzle },
  { href: "/templates", label: "Templates", icon: FileCode2 },
  { href: "/openclaw", label: "OpenClaw Settings", icon: Settings },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  // Fetch agents for quick-nav (only when palette is open)
  const { data: agentsData } = useSWR<AgentsResponse>(
    open ? "/api/openclaw/agents" : null,
    fetcher,
  );
  const agents = agentsData?.agents ?? [];

  // Global keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Don't fire shortcuts when typing in inputs/textareas (except ⌘K)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if (meta && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      // ⌘/ — show keyboard shortcuts
      if (meta && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // ⌘1-6 — quick page navigation
      if (meta && e.key >= "1" && e.key <= "6") {
        const idx = parseInt(e.key) - 1;
        if (pages[idx]) {
          e.preventDefault();
          router.push(pages[idx].href);
        }
        return;
      }
    },
    [router],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function runAction(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
  <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigate */}
        <CommandGroup heading="Pages">
          {pages.map(({ href, label, icon: Icon }) => (
            <CommandItem
              key={href}
              onSelect={() => runAction(() => router.push(href))}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Agents */}
        {agents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {agents.map((a) => (
                <CommandItem
                  key={a.id}
                  onSelect={() =>
                    runAction(() => router.push(`/agents/${a.id}`))
                  }
                >
                  <span className="mr-2 text-base leading-none">
                    <AgentEmoji emoji={a.emoji || "🤖"} iconClassName="h-4 w-4" />
                  </span>
                  {a.name || a.id}
                </CommandItem>
              ))}
              <CommandItem
                onSelect={() => runAction(() => router.push("/agents"))}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Agent…
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Quick actions */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => runAction(() => router.push("/chat"))}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            New Chat
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => setShowShortcuts(true))}
          >
            <span className="mr-2 text-sm">⌨️</span>
            Keyboard Shortcuts
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => setShowApiKeys(true))}
          >
            <Key className="mr-2 h-4 w-4" />
            Manage API Keys
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => setShowModels(true))}
          >
            <Brain className="mr-2 h-4 w-4" />
            Change Model
          </CommandItem>
        </CommandGroup>

        {/* Theme */}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => runAction(() => setTheme("light"))}>
            <Sun className="mr-2 h-4 w-4" />
            Light
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme("dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => setTheme("system"))}>
            <Monitor className="mr-2 h-4 w-4" />
            System
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>

    {/* Keyboard shortcuts help */}
    <KeyboardShortcutsDialog
      open={showShortcuts}
      onOpenChange={setShowShortcuts}
    />
    <ApiKeysDialog open={showApiKeys} onOpenChange={setShowApiKeys} />
    <ModelSelectorDialog open={showModels} onOpenChange={setShowModels} />
  </>
  );
}

const shortcuts = [
  { keys: ["⌘", "K"], desc: "Open command palette" },
  { keys: ["⌘", "/"], desc: "Show keyboard shortcuts" },
  { keys: ["⌘", "1"], desc: "Go to Dashboard" },
  { keys: ["⌘", "2"], desc: "Go to Agents" },
  { keys: ["⌘", "3"], desc: "Go to Chat" },
  { keys: ["⌘", "4"], desc: "Go to Skills" },
  { keys: ["⌘", "5"], desc: "Go to Templates" },
  { keys: ["⌘", "6"], desc: "Go to OpenClaw" },
  { keys: ["Enter"], desc: "Send chat message" },
  { keys: ["Shift", "Enter"], desc: "New line in chat" },
];

function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="divide-y">
          {shortcuts.map(({ keys, desc }) => (
            <div
              key={desc}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-muted-foreground">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
