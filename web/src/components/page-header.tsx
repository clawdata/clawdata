"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Optional subtitle / metadata line */
  description?: ReactNode;
  /** Action buttons aligned to the right */
  actions?: ReactNode;
  className?: string;
}

/**
 * Consistent page header with title, optional description,
 * and right-aligned action buttons.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
