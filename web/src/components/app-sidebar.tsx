"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Puzzle,
  FileCode2,
  Settings,
  Shell,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  MoreVertical,
  Play,
  Square,
  RefreshCw,
  Stethoscope,
  SlidersHorizontal,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { lifecycleApi } from "@/lib/api";
import { toast } from "sonner";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/skills", label: "Skills", icon: Puzzle },
  { href: "/templates", label: "Templates", icon: FileCode2 },
  { href: "/costing", label: "Costing", icon: DollarSign },
  { href: "/openclaw", label: "OpenClaw", icon: Settings },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

interface GatewayHealth {
  state: string;
}

interface FullStatus {
  gateway: GatewayHealth;
}

const statusFetcher = (url: string) =>
  fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${url}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: status, mutate } = useSWR<FullStatus>(
    "/api/openclaw/status",
    statusFetcher,
    { refreshInterval: 15000, revalidateOnFocus: false }
  );

  const gwState = status?.gateway?.state;
  const gwRunning = gwState === "running";

  async function gwAction(label: string, fn: () => Promise<unknown>) {
    const id = toast.loading(`${label}…`);
    try {
      const res = (await fn()) as { message?: string; success?: boolean };
      toast.success(res?.message ?? `${label} completed`, { id });
      mutate();
    } catch (e) {
      toast.error(`${label} failed: ${String(e)}`, { id });
    }
  }

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 border-b px-3 py-4">
        <Shell className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && <span className="text-lg font-bold">ClawData</span>}
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isOpenClaw = href === "/openclaw";

          const link = (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <span className="relative shrink-0">
                <Icon className="h-4 w-4" />
                {isOpenClaw && gwState && (
                  <span
                    className={cn(
                      "absolute -right-1 -top-1 h-2 w-2 rounded-full border border-sidebar",
                      gwRunning
                        ? "bg-green-500"
                        : gwState === "error"
                          ? "bg-red-500"
                          : gwState === "not_installed" || gwState === "unknown"
                            ? "bg-yellow-500"
                            : "bg-green-500"
                    )}
                  />
                )}
              </span>
              {!collapsed && <span>{label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {label}
                  {isOpenClaw && gwState && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({gwState})
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          }

          {/* OpenClaw nav item with gateway controls dropdown */}
          if (isOpenClaw) {
            return (
              <div key={href} className="group/oc relative flex items-center">
                <Link
                  href={href}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-4 w-4" />
                    {gwState && (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 h-2 w-2 rounded-full border border-sidebar",
                          gwRunning
                            ? "bg-green-500"
                            : gwState === "error"
                              ? "bg-red-500"
                              : gwState === "not_installed" || gwState === "unknown"
                                ? "bg-yellow-500"
                                : "bg-green-500"
                        )}
                      />
                    )}
                  </span>
                  <span>{label}</span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="absolute right-1 rounded p-1 opacity-0 transition-opacity hover:bg-sidebar-accent group-hover/oc:opacity-100 focus:opacity-100"
                      aria-label="Gateway controls"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="w-44">
                    {gwRunning ? (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            gwAction("Restart", () => lifecycleApi.restart())
                          }
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Restart
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            gwAction("Stop", () => lifecycleApi.stop())
                          }
                        >
                          <Square className="mr-2 h-3.5 w-3.5" />
                          Stop
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem
                        onClick={() =>
                          gwAction("Start", () => lifecycleApi.start())
                        }
                      >
                        <Play className="mr-2 h-3.5 w-3.5" />
                        Start
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        gwAction("Doctor", () => lifecycleApi.doctor(true))
                      }
                    >
                      <Stethoscope className="mr-2 h-3.5 w-3.5" />
                      Run Doctor
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          }

          return link;
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-2 py-2">
        <div
          className={cn(
            "flex items-center",
            collapsed ? "flex-col gap-1" : "justify-between"
          )}
        >
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 md:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
        {!collapsed && (
          <p className="mt-1 px-2 text-[10px] text-muted-foreground">
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[9px] font-mono">⌘K</kbd> command palette
          </p>
        )}
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile hamburger (shown in the top-left when sidebar is hidden) */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-3 z-50 h-9 w-9 md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Desktop: static in flex layout
          "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 z-50 md:relative",
          // Mobile visibility
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          // Width
          collapsed ? "md:w-14 w-56" : "w-56",
        )}
      >
        {sidebarContent}
      </aside>
    </TooltipProvider>
  );
}
