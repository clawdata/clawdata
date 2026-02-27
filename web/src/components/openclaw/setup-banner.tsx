"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, type OnboardingStatus, type FullStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, X } from "lucide-react";
import { SetupWizardDialog } from "@/components/openclaw/setup-wizard-dialog";

/**
 * Thin banner shown at the top of every page when OpenClaw is not fully
 * onboarded or not installed. Clicking the action button opens the setup
 * wizard dialog at the appropriate step.
 * The banner auto-hides once everything is healthy or the user dismisses it.
 */
export function SetupBanner() {
  const { data: onboarding } = useSWR<OnboardingStatus>(
    "/api/openclaw/onboarding",
    fetcher,
    { refreshInterval: 30_000 },
  );
  const { data: status } = useSWR<FullStatus>(
    "/api/openclaw/status",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const [dismissed, setDismissed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const isNotInstalled = status?.gateway?.state === "not_installed";
  const isNotOnboarded = onboarding && !onboarding.onboarded;
  const shouldShow = isNotInstalled || isNotOnboarded;

  // Don't show if still loading, everything is fine, or dismissed
  if (!onboarding || !shouldShow || dismissed) return null;

  const message = isNotInstalled
    ? "OpenClaw is not installed. Install it to enable AI-powered agents, chat, and skill execution."
    : "OpenClaw is not fully configured. Complete the setup wizard to start using your AI assistant.";

  return (
    <>
      <SetupWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialStep={isNotInstalled ? 0 : undefined}
      />
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2.5 text-sm dark:border-yellow-700 dark:bg-yellow-950">
        {isNotInstalled ? (
          <Download className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        )}
        <span className="flex-1 text-yellow-800 dark:text-yellow-200">
          {message}
        </span>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs"
          onClick={() => setWizardOpen(true)}
        >
          {isNotInstalled ? "Install OpenClaw" : "Complete Setup"}
        </Button>
        <button
          className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
