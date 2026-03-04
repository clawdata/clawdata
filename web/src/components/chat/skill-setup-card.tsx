"use client";

import { useState, useRef } from "react";
import { Wrench, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SkillSetupData } from "./types";

interface SkillSetupCardProps {
  data: SkillSetupData;
  /** Called for each field when the user submits the form */
  onStore: (field: string, envVar: string, value: string, label: string) => void;
}

export function SkillSetupCard({ data, onStore }: SkillSetupCardProps) {
  // Local state for field values — never leave this component
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of data.fields) {
      init[f.envVar] = "";
    }
    return init;
  });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<"pending" | "saving" | "saved">("pending");
  const formRef = useRef<HTMLFormElement>(null);

  const isPending = data.status === "pending" && localStatus === "pending";
  const isSaving = data.status === "saving" || localStatus === "saving";
  const isSaved = data.status === "saved" || localStatus === "saved";

  function toggleReveal(envVar: string) {
    setRevealed((prev) => ({ ...prev, [envVar]: !prev[envVar] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setLocalStatus("saving");

    // Collect fields that have values (skip configured + empty optional)
    let stored = 0;
    for (const f of data.fields) {
      const val = values[f.envVar]?.trim();
      if (!val) continue;
      // Use integrations.<skill>.<key> as the config field path
      const configField = `integrations.${data.skill}.${f.envVar}`;
      onStore(configField, f.envVar, val, f.label);
      stored++;
    }

    if (stored > 0) {
      setLocalStatus("saved");
    } else {
      setSaving(false);
      setLocalStatus("pending");
    }
  }

  // Count how many fields need filling
  const requiredEmpty = data.fields.filter(
    (f) => !f.optional && !f.configured && !values[f.envVar]?.trim(),
  ).length;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[75%] rounded-lg border p-4 space-y-3",
        isPending && "border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20",
        isSaving && "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
        isSaved && "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium">
          Configure {data.skill.charAt(0).toUpperCase() + data.skill.slice(1)} Credentials
        </span>
        {isSaved && (
          <Badge
            variant="outline"
            className="text-[10px] ml-auto text-green-600 border-green-300 dark:text-green-400 dark:border-green-700"
          >
            saved
          </Badge>
        )}
      </div>

      {isSaved ? (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          <span>Credentials stored in secrets manager</span>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-2.5">
          {data.fields.map((f) => (
            <div key={f.envVar} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium text-foreground">
                  {f.label}
                </label>
                {f.optional && (
                  <span className="text-[9px] text-muted-foreground">(optional)</span>
                )}
                {f.configured && (
                  <Badge
                    variant="outline"
                    className="text-[9px] text-green-600 border-green-300 dark:text-green-400 dark:border-green-700 ml-auto"
                  >
                    configured
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  type={revealed[f.envVar] ? "text" : "password"}
                  placeholder={f.configured ? "••• already set (leave empty to keep)" : f.placeholder}
                  value={values[f.envVar] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.envVar]: e.target.value }))
                  }
                  className="h-8 text-xs font-mono pr-8"
                  disabled={saving}
                  autoComplete="off"
                  data-1p-ignore
                />
                <button
                  type="button"
                  onClick={() => toggleReveal(f.envVar)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {revealed[f.envVar] ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground font-mono">{f.envVar}</p>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              size="sm"
              variant="default"
              className="h-7 text-xs"
              disabled={saving || requiredEmpty > 0}
            >
              {saving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}
              Save Credentials
            </Button>
            {requiredEmpty > 0 && (
              <span className="text-[10px] text-muted-foreground self-center">
                {requiredEmpty} required field{requiredEmpty > 1 ? "s" : ""} remaining
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
