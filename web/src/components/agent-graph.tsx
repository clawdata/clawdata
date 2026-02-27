"use client";

import { useEffect, useState } from "react";
import { lifecycleApi, type OpenClawAgent } from "@/lib/api";

interface AgentGraphProps {
  agents: OpenClawAgent[];
  mainKey: string;
  onAgentClick?: (id: string) => void;
}

interface Edge {
  from: string;
  to: string;
}

/**
 * Fetch each agent's AGENTS.md to build the link map.
 */
function useAgentLinks(agents: OpenClawAgent[]) {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const allEdges: Edge[] = [];
      const ids = agents.map((a) => a.id);

      await Promise.all(
        agents.map(async (agent) => {
          try {
            const file = await lifecycleApi.agentFile(agent.id, "AGENTS.md");
            const content = file.content ?? "";
            for (const otherId of ids) {
              if (otherId === agent.id) continue;
              if (
                content.includes(`@${otherId}`) ||
                content.includes(`agent_id: ${otherId}`)
              ) {
                allEdges.push({ from: agent.id, to: otherId });
              }
            }
          } catch {
            // No AGENTS.md or not accessible
          }
        })
      );

      if (!cancelled) {
        setEdges(allEdges);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agents]);

  return { edges, loading };
}

/**
 * Simple hierarchy graph.
 * Connected agents appear below their parent with vertical/orthogonal lines.
 * Unlinked agents float in a separate row.
 */
export function AgentGraph({ agents, mainKey, onAgentClick }: AgentGraphProps) {
  const { edges, loading } = useAgentLinks(agents);

  const NODE_W = 176;
  const NODE_H = 88;
  const GAP_X = 32;
  const GAP_Y = 80;
  const PAD = 40;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-muted/20 py-20">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading agent links…
        </p>
      </div>
    );
  }

  // Build adjacency: which agents does each agent link TO
  const linkedTo = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!linkedTo.has(e.from)) linkedTo.set(e.from, new Set());
    linkedTo.get(e.from)!.add(e.to);
  }

  // Find root
  const root = agents.find((a) => a.id === mainKey) ?? agents[0];

  // Children = agents the root links to
  const rootLinkedIds = linkedTo.get(root.id) ?? new Set<string>();
  const linkedChildren = agents.filter(
    (a) => a.id !== root.id && rootLinkedIds.has(a.id)
  );

  // Unlinked = agents not linked from root (and not root itself)
  const unlinked = agents.filter(
    (a) => a.id !== root.id && !rootLinkedIds.has(a.id)
  );

  // Layout
  const hasChildren = linkedChildren.length > 0;
  const hasUnlinked = unlinked.length > 0;

  const childrenWidth =
    linkedChildren.length * NODE_W +
    Math.max(0, linkedChildren.length - 1) * GAP_X;
  const unlinkedWidth =
    unlinked.length * NODE_W + Math.max(0, unlinked.length - 1) * GAP_X;

  const canvasW =
    Math.max(NODE_W, childrenWidth, unlinkedWidth) + PAD * 2;

  // Vertical layers
  const rootY = PAD;
  const childY = rootY + NODE_H + GAP_Y;
  const unlinkedLabelY = hasChildren ? childY + NODE_H + GAP_Y - 16 : rootY + NODE_H + GAP_Y - 16;
  const unlinkedY = unlinkedLabelY + 24;

  let canvasH = rootY + NODE_H + PAD;
  if (hasChildren) canvasH = childY + NODE_H + PAD;
  if (hasUnlinked) canvasH = unlinkedY + NODE_H + PAD;

  // Positions
  const rootX = canvasW / 2 - NODE_W / 2;
  const childStartX = (canvasW - childrenWidth) / 2;
  const unlinkedStartX = (canvasW - unlinkedWidth) / 2;

  const rootCx = rootX + NODE_W / 2;

  return (
    <div className="w-full overflow-x-auto rounded-lg border bg-muted/20">
      <svg
        width={canvasW}
        height={canvasH}
        className="mx-auto block"
        style={{ minWidth: canvasW }}
      >
        {/* Orthogonal lines: root → children */}
        {hasChildren && (() => {
          const stemBottom = rootY + NODE_H + GAP_Y / 2;
          const childCxs = linkedChildren.map(
            (_, i) => childStartX + i * (NODE_W + GAP_X) + NODE_W / 2
          );
          const railLeft = Math.min(rootCx, ...childCxs);
          const railRight = Math.max(rootCx, ...childCxs);

          return (
            <>
              {/* Vertical stem from root down to rail */}
              <line
                x1={rootCx}
                y1={rootY + NODE_H}
                x2={rootCx}
                y2={stemBottom}
                className="stroke-border"
                strokeWidth={2}
              />
              {/* Horizontal rail */}
              {linkedChildren.length > 1 && (
                <line
                  x1={railLeft}
                  y1={stemBottom}
                  x2={railRight}
                  y2={stemBottom}
                  className="stroke-border"
                  strokeWidth={2}
                />
              )}
              {/* Vertical drops to each child */}
              {childCxs.map((cx, i) => (
                <line
                  key={linkedChildren[i].id}
                  x1={cx}
                  y1={stemBottom}
                  x2={cx}
                  y2={childY}
                  className="stroke-border"
                  strokeWidth={2}
                />
              ))}
            </>
          );
        })()}

        {/* Root node */}
        <GraphNode
          x={rootX}
          y={rootY}
          agent={root}
          width={NODE_W}
          height={NODE_H}
          isRoot
          onClick={() => onAgentClick?.(root.id)}
        />

        {/* Linked children */}
        {linkedChildren.map((a, i) => (
          <GraphNode
            key={a.id}
            x={childStartX + i * (NODE_W + GAP_X)}
            y={childY}
            agent={a}
            width={NODE_W}
            height={NODE_H}
            onClick={() => onAgentClick?.(a.id)}
          />
        ))}

        {/* Unlinked section */}
        {hasUnlinked && (
          <>
            <text
              x={canvasW / 2}
              y={unlinkedLabelY}
              textAnchor="middle"
              className="fill-muted-foreground select-none"
              style={{ fontSize: 11 }}
            >
              Not linked
            </text>
            {unlinked.map((a, i) => (
              <GraphNode
                key={a.id}
                x={unlinkedStartX + i * (NODE_W + GAP_X)}
                y={unlinkedY}
                agent={a}
                width={NODE_W}
                height={NODE_H}
                dimmed
                onClick={() => onAgentClick?.(a.id)}
              />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

function GraphNode({
  x,
  y,
  agent,
  width,
  height,
  isRoot,
  dimmed,
  onClick,
}: {
  x: number;
  y: number;
  agent: OpenClawAgent;
  width: number;
  height: number;
  isRoot?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      opacity={dimmed ? 0.45 : 1}
    >
      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
        className={
          isRoot
            ? "fill-background stroke-primary"
            : "fill-background stroke-border"
        }
        strokeWidth={isRoot ? 2 : 1.5}
      />

      {/* Emoji / icon circle */}
      <circle
        cx={x + 28}
        cy={y + 26}
        r={14}
        className="fill-muted"
      />

      {/* Emoji text */}
      <text
        x={x + 28}
        y={y + 31}
        textAnchor="middle"
        className="select-none"
        style={{ fontSize: 14 }}
      >
        {agent.emoji
          ? agent.emoji === "꩜"
            ? "⚙"
            : agent.emoji
          : "🤖"}
      </text>

      {/* Agent name */}
      <text
        x={x + 50}
        y={y + 24}
        className="fill-foreground text-xs font-medium select-none"
        style={{ fontSize: 13 }}
      >
        {(agent.name || agent.id).length > 12
          ? (agent.name || agent.id).slice(0, 12) + "…"
          : agent.name || agent.id}
      </text>

      {/* Agent id */}
      <text
        x={x + 50}
        y={y + 38}
        className="fill-muted-foreground select-none"
        style={{ fontSize: 10, fontFamily: "monospace" }}
      >
        {agent.id}
      </text>

      {/* Skills */}
      {agent.skills.length > 0 ? (
        <text
          x={x + 8}
          y={y + height - 12}
          className="fill-muted-foreground select-none"
          style={{ fontSize: 9 }}
        >
          {agent.skills.slice(0, 3).join(" · ")}{agent.skills.length > 3 ? ` +${agent.skills.length - 3}` : ""}
        </text>
      ) : (
        <text
          x={x + 8}
          y={y + height - 12}
          className="fill-muted-foreground/50 select-none"
          style={{ fontSize: 9, fontStyle: "italic" }}
        >
          No skills
        </text>
      )}

      {/* Default badge */}
      {agent.is_default && (
        <>
          <rect
            x={x + width - 52}
            y={y + 6}
            width={44}
            height={16}
            rx={8}
            className="fill-primary/10"
          />
          <text
            x={x + width - 30}
            y={y + 17}
            textAnchor="middle"
            className="fill-primary select-none"
            style={{ fontSize: 9, fontWeight: 500 }}
          >
            default
          </text>
        </>
      )}

      {/* Hover overlay */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
        className="fill-transparent hover:fill-primary/5 transition-colors"
        strokeWidth={0}
      />
    </g>
  );
}
