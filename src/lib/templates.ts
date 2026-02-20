/**
 * Project templates for `clawdata init --template <name>`.
 *
 * Each template provides a set of bronze SQL models and source table names
 * tailored to its domain.  Shared scaffolding (dbt_project.yml, profiles.yml,
 * directory structure) is handled by the init command itself.
 */

export interface ProjectTemplate {
  /** Machine-readable key used with --template. */
  name: string;
  /** Human-friendly description. */
  description: string;
  /** Source table names (mapped to raw.* in _sources.yml). */
  sourceTables: { name: string; description: string }[];
  /** Bronze model files (filename → SQL). */
  bronzeModels: Record<string, string>;
}

export const TEMPLATES: Record<string, ProjectTemplate> = {
  ecommerce: {
    name: "ecommerce",
    description: "E-commerce starter — customers, orders, products, payments",
    sourceTables: [
      { name: "sample_customers", description: "Raw CRM customer export" },
      { name: "sample_products", description: "Raw product catalogue export" },
      { name: "sample_orders", description: "Raw denormalised order + line-item export" },
      { name: "sample_payments", description: "Raw payment processor transactions" },
    ],
    bronzeModels: {
      "brz_customers.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_customers') }}\n",
      "brz_orders.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_orders') }}\n",
      "brz_products.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_products') }}\n",
      "brz_payments.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_payments') }}\n",
    },
  },

  saas: {
    name: "saas",
    description: "SaaS metrics — users, subscriptions, events, invoices",
    sourceTables: [
      { name: "sample_users", description: "Raw user sign-ups from the auth system" },
      { name: "sample_subscriptions", description: "Subscription lifecycle events (created, upgraded, cancelled)" },
      { name: "sample_events", description: "Product analytics events (page views, clicks, feature usage)" },
      { name: "sample_invoices", description: "Billing invoices from the payment provider" },
    ],
    bronzeModels: {
      "brz_users.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_users') }}\n",
      "brz_subscriptions.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_subscriptions') }}\n",
      "brz_events.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_events') }}\n",
      "brz_invoices.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_invoices') }}\n",
    },
  },

  financial: {
    name: "financial",
    description: "Financial reporting — accounts, transactions, journals, budgets",
    sourceTables: [
      { name: "sample_accounts", description: "Chart of accounts from the general ledger" },
      { name: "sample_transactions", description: "Raw financial transactions" },
      { name: "sample_journals", description: "Journal entry records" },
      { name: "sample_budgets", description: "Budget line items by period and cost centre" },
    ],
    bronzeModels: {
      "brz_accounts.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_accounts') }}\n",
      "brz_transactions.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_transactions') }}\n",
      "brz_journals.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_journals') }}\n",
      "brz_budgets.sql":
        "-- Bronze: raw passthrough from source\nSELECT * FROM {{ source('raw', 'sample_budgets') }}\n",
    },
  },
};

/** List available template names. */
export function listTemplates(): string[] {
  return Object.keys(TEMPLATES);
}

/** Get a template by name, or undefined if not found. */
export function getTemplate(name: string): ProjectTemplate | undefined {
  return TEMPLATES[name.toLowerCase()];
}

/** Generate _sources.yml content for a template. */
export function renderSourcesYml(template: ProjectTemplate): string {
  const tables = template.sourceTables
    .map((t) => `      - name: ${t.name}\n        description: "${t.description}"`)
    .join("\n");

  return `version: 2

sources:
  - name: raw
    description: "Raw data loaded into DuckDB"
    schema: main
    tables:
${tables}
`;
}
