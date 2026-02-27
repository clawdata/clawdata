"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

/** Human-friendly labels for known route segments */
const LABELS: Record<string, string> = {
  "": "Dashboard",
  agents: "Agents",
  chat: "Chat",
  skills: "Skills",
  templates: "Templates",
  openclaw: "OpenClaw",
  settings: "Settings",
};

/**
 * Auto-generates breadcrumbs from the current path.
 * Hidden on the root "/" route since there's nothing to show.
 */
/** Routes where breadcrumbs are hidden (full-height pages) */
const HIDDEN_ROUTES = new Set(["/", "/chat"]);

export function AutoBreadcrumb() {
  const pathname = usePathname();

  if (HIDDEN_ROUTES.has(pathname)) return null;

  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = LABELS[seg] ?? decodeURIComponent(seg);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Home</BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map(({ href, label, isLast }) => (
          <Fragment key={href}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {isLast ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
