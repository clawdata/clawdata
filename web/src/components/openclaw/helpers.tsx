"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function StateBadge({ state }: { state: string }) {
  const v =
    state === "running"
      ? "default"
      : state === "error" || state === "not_installed"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={v as "default"} className="text-xs">
      {state.replace("_", " ")}
    </Badge>
  );
}

export function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-red-500" />
  );
}

export function Spin() {
  return <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />;
}
