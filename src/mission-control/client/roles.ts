/**
 * Mission Control — Agent roles and templates.
 */

export interface AgentRole {
  id: string;
  name: string;
  theme: string;
  description: string;
  skills: string[];
  model: string;
  icon: string;
  color: string;
  tier: string;
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: "data-discovery",
    name: "Scout",
    theme: "Data Discovery",
    description: "Explores data sources, profiles datasets, discovers schemas and relationships.",
    skills: ["duckdb", "s3", "postgres"],
    model: "claude-sonnet-4-5",
    icon: "🔍",
    color: "#22d3ee",
    tier: "specialist",
  },
  {
    id: "data-modeling",
    name: "Architect",
    theme: "Data Modeling",
    description: "Designs dimensional models, builds dbt transformations, manages silver/gold layers.",
    skills: ["dbt", "duckdb", "snowflake"],
    model: "claude-opus-4-6",
    icon: "🏗",
    color: "#a78bfa",
    tier: "specialist",
  },
  {
    id: "orchestration",
    name: "Pipeline",
    theme: "Orchestration",
    description: "Manages ETL/ELT workflows, schedules DAGs, monitors pipeline health.",
    skills: ["airflow", "dagster", "fivetran", "dlt"],
    model: "claude-sonnet-4-5",
    icon: "🔄",
    color: "#60a5fa",
    tier: "specialist",
  },
  {
    id: "data-quality",
    name: "Guardian",
    theme: "Data Quality",
    description: "Enforces data contracts, runs quality tests, monitors anomalies and SLA compliance.",
    skills: ["great-expectations", "dbt"],
    model: "claude-sonnet-4-5",
    icon: "🛡",
    color: "#34d399",
    tier: "specialist",
  },
  {
    id: "analytics",
    name: "Analyst",
    theme: "Analytics & Insights",
    description: "Runs ad-hoc queries, generates reports, builds dashboards and visualizations.",
    skills: ["duckdb", "metabase", "postgres"],
    model: "claude-sonnet-4-5",
    icon: "📊",
    color: "#fbbf24",
    tier: "specialist",
  },
  {
    id: "infrastructure",
    name: "Ops",
    theme: "Infrastructure",
    description: "Manages cloud warehouses, handles scaling, monitors infrastructure costs.",
    skills: ["snowflake", "bigquery", "databricks", "spark", "kafka"],
    model: "claude-sonnet-4-5",
    icon: "⚙",
    color: "#f472b6",
    tier: "support",
  },
  {
    id: "coding-agent",
    name: "Coder",
    theme: "Coding Agent",
    description: "Delegates coding tasks to sub-agents, writes scripts, automates development workflows.",
    skills: ["coding-agent", "github", "gh-issues"],
    model: "claude-sonnet-4-5",
    icon: "🧩",
    color: "#818cf8",
    tier: "specialist",
  },
  {
    id: "comms",
    name: "Comms",
    theme: "Communications",
    description: "Manages Slack, Discord, and notification channels. Routes messages across the team.",
    skills: ["slack", "discord"],
    model: "claude-sonnet-4-5",
    icon: "💬",
    color: "#fb923c",
    tier: "support",
  },
];

export const AGENT_TEMPLATES = AGENT_ROLES.map(r => ({ ...r, role: r.theme }));
