"use client";

import { useState, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title: string;
  description: string;
  /** Label for the confirm button (default: "Continue") */
  confirmLabel?: string;
  /** Whether to show the confirm button in destructive style */
  destructive?: boolean;
}

/**
 * Hook that returns a `confirm()` replacement backed by an AlertDialog.
 *
 * Usage:
 * ```tsx
 * const [ConfirmDialog, confirm] = useConfirm();
 *
 * async function handleDelete() {
 *   const ok = await confirm({
 *     title: "Delete item?",
 *     description: "This cannot be undone.",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *   // proceed with delete
 * }
 *
 * return <><ConfirmDialog />...</>
 * ```
 */
export function useConfirm(): [
  () => React.JSX.Element,
  (opts: ConfirmOptions) => Promise<boolean>,
] {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const handleResult = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!state) return <></>;
    return (
      <AlertDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) handleResult(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleResult(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleResult(true)}
              className={
                state.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {state.confirmLabel ?? "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [state, handleResult]);

  return [ConfirmDialog, confirm];
}
