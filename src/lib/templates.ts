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
  /** Silver model files (filename → SQL). */
  silverModels: Record<string, string>;
  /** Gold model files (filename → SQL). */
  goldModels: Record<string, string>;
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
    silverModels: {
      "slv_customers.sql": `-- Silver: deduplicated, standardised customers
WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(email)) ORDER BY updated_at DESC
    ) AS row_num
    FROM {{ ref('brz_customers') }}
    WHERE email IS NOT NULL AND TRIM(email) != ''
)
SELECT
    id AS customer_id,
    TRIM(first_name) AS first_name,
    TRIM(last_name) AS last_name,
    LOWER(TRIM(email)) AS email,
    NULLIF(TRIM(phone), '') AS phone,
    TRIM(city) AS city,
    UPPER(TRIM(state)) AS state,
    TRIM(postal_code) AS postal_code,
    UPPER(TRIM(country)) AS country_code,
    registered_at::TIMESTAMP AS registered_at,
    updated_at::TIMESTAMP AS updated_at,
    account_status,
    acquisition_source
FROM ranked WHERE row_num = 1
`,
      "slv_orders.sql": `-- Silver: normalised order headers (one row per order)
WITH order_lines AS (
    SELECT
        order_id, customer_id,
        order_date::DATE AS order_date, order_status,
        discount_pct, shipping_amount, tax_rate,
        shipping_city, shipping_country,
        created_at::TIMESTAMP AS created_at,
        SUM(line_total) AS subtotal,
        COUNT(*) AS line_count
    FROM {{ ref('brz_orders') }}
    WHERE order_status NOT IN ('cancelled')
    GROUP BY order_id, customer_id, order_date, order_status,
        discount_pct, shipping_amount, tax_rate,
        shipping_city, shipping_country, created_at
)
SELECT
    order_id, customer_id, order_date, order_status,
    line_count, subtotal,
    ROUND(subtotal * (discount_pct / 100.0), 2) AS discount_amount,
    ROUND(subtotal * (1 - discount_pct / 100.0), 2) AS net_amount,
    ROUND(subtotal * (1 - discount_pct / 100.0) * tax_rate, 2) AS tax_amount,
    shipping_amount,
    ROUND(subtotal * (1 - discount_pct / 100.0) + subtotal * (1 - discount_pct / 100.0) * tax_rate + shipping_amount, 2) AS total_amount,
    discount_pct, tax_rate, shipping_city, shipping_country, created_at
FROM order_lines
`,
      "slv_order_items.sql": `-- Silver: individual order line items
SELECT
    order_id || '-' || line_id AS order_item_id,
    order_id, line_id, customer_id, product_sku,
    quantity, unit_price, line_total,
    ROUND(line_total * (discount_pct / 100.0), 2) AS line_discount,
    order_date::DATE AS order_date, order_status
FROM {{ ref('brz_orders') }}
WHERE order_status NOT IN ('cancelled') AND quantity > 0
`,
      "slv_payments.sql": `-- Silver: validated payment transactions
SELECT
    transaction_id, order_id,
    CASE payment_method
        WHEN 'credit_card' THEN 'Credit Card'
        WHEN 'paypal' THEN 'PayPal'
        WHEN 'bank_transfer' THEN 'Bank Transfer'
        WHEN 'apple_pay' THEN 'Apple Pay'
        ELSE REPLACE(payment_method, '_', ' ')
    END AS payment_method,
    amount, UPPER(currency) AS currency,
    status AS payment_status, processor_ref,
    processed_at::TIMESTAMP AS processed_at
FROM {{ ref('brz_payments') }}
WHERE status != 'failed'
`,
      "slv_products.sql": `-- Silver: cleaned product catalogue
SELECT
    sku AS product_sku,
    TRIM(product_name) AS product_name,
    TRIM(category) AS category,
    TRIM(subcategory) AS subcategory,
    unit_price, cost_price,
    ROUND(unit_price - cost_price, 2) AS margin,
    ROUND((unit_price - cost_price) / NULLIF(unit_price, 0) * 100, 1) AS margin_pct,
    weight_kg,
    created_date::DATE AS created_date,
    is_active
FROM {{ ref('brz_products') }}
WHERE is_active = true
`,
    },
    goldModels: {
      "dim_customers.sql": `-- Gold: customer dimension with order stats and segments
WITH order_stats AS (
    SELECT customer_id,
        COUNT(DISTINCT order_id) AS total_orders,
        SUM(total_amount) AS lifetime_value,
        MIN(order_date) AS first_order_date,
        MAX(order_date) AS last_order_date,
        AVG(total_amount) AS avg_order_value
    FROM {{ ref('slv_orders') }}
    GROUP BY customer_id
)
SELECT
    c.customer_id, c.first_name, c.last_name,
    c.first_name || ' ' || c.last_name AS full_name,
    c.email, c.city, c.country_code, c.acquisition_source,
    COALESCE(o.total_orders, 0) AS total_orders,
    COALESCE(o.lifetime_value, 0) AS lifetime_value,
    ROUND(COALESCE(o.avg_order_value, 0), 2) AS avg_order_value,
    o.first_order_date, o.last_order_date,
    CASE
        WHEN COALESCE(o.total_orders, 0) = 0 THEN 'Prospect'
        WHEN o.lifetime_value >= 1000 AND o.total_orders >= 3 THEN 'VIP'
        WHEN o.total_orders >= 3 THEN 'Loyal'
        ELSE 'Active'
    END AS customer_segment
FROM {{ ref('slv_customers') }} c
LEFT JOIN order_stats o ON c.customer_id = o.customer_id
`,
      "dim_products.sql": `-- Gold: product dimension with sales metrics
WITH product_stats AS (
    SELECT product_sku,
        SUM(quantity) AS total_units_sold,
        SUM(line_total) AS total_revenue
    FROM {{ ref('slv_order_items') }}
    GROUP BY product_sku
)
SELECT
    p.product_sku, p.product_name, p.category, p.subcategory,
    p.unit_price, p.cost_price, p.margin, p.margin_pct,
    COALESCE(s.total_units_sold, 0) AS total_units_sold,
    ROUND(COALESCE(s.total_revenue, 0), 2) AS total_revenue,
    ROUND(COALESCE(s.total_revenue, 0) - COALESCE(s.total_units_sold, 0) * p.cost_price, 2) AS total_profit
FROM {{ ref('slv_products') }} p
LEFT JOIN product_stats s ON p.product_sku = s.product_sku
`,
      "fct_orders.sql": `-- Gold: order fact table with payment info
WITH payment_agg AS (
    SELECT order_id,
        STRING_AGG(DISTINCT payment_method, ', ') AS payment_methods,
        SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) AS paid_amount
    FROM {{ ref('slv_payments') }}
    GROUP BY order_id
)
SELECT
    o.order_id, o.customer_id, o.order_date, o.order_status,
    o.line_count, o.subtotal, o.discount_amount, o.net_amount,
    o.tax_amount, o.shipping_amount, o.total_amount,
    COALESCE(p.payment_methods, 'Unpaid') AS payment_methods,
    COALESCE(p.paid_amount, 0) AS paid_amount,
    o.created_at
FROM {{ ref('slv_orders') }} o
LEFT JOIN payment_agg p ON o.order_id = p.order_id
`,
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
    silverModels: {
      "slv_users.sql": `-- Silver: deduplicated users with standardised fields
SELECT
    user_id, TRIM(email) AS email, TRIM(display_name) AS display_name,
    signup_date::DATE AS signup_date, plan,
    UPPER(TRIM(country)) AS country_code, is_active
FROM {{ ref('brz_users') }}
WHERE email IS NOT NULL
`,
      "slv_subscriptions.sql": `-- Silver: normalised subscription events
SELECT
    subscription_id, user_id, plan, status,
    started_at::TIMESTAMP AS started_at,
    ended_at::TIMESTAMP AS ended_at,
    mrr_amount, billing_interval
FROM {{ ref('brz_subscriptions') }}
`,
      "slv_events.sql": `-- Silver: cleaned product analytics events
SELECT
    event_id, user_id, event_type,
    page_url, referrer,
    created_at::TIMESTAMP AS created_at
FROM {{ ref('brz_events') }}
WHERE event_type IS NOT NULL
`,
      "slv_invoices.sql": `-- Silver: validated invoices
SELECT
    invoice_id, user_id, subscription_id,
    amount, currency, status AS invoice_status,
    issued_at::TIMESTAMP AS issued_at,
    paid_at::TIMESTAMP AS paid_at
FROM {{ ref('brz_invoices') }}
WHERE status != 'void'
`,
    },
    goldModels: {
      "dim_users.sql": `-- Gold: user dimension with subscription and activity stats
WITH sub_stats AS (
    SELECT user_id,
        COUNT(*) AS total_subscriptions,
        MAX(mrr_amount) AS current_mrr
    FROM {{ ref('slv_subscriptions') }}
    WHERE status = 'active'
    GROUP BY user_id
)
SELECT
    u.user_id, u.email, u.display_name, u.signup_date,
    u.plan, u.country_code, u.is_active,
    COALESCE(s.total_subscriptions, 0) AS total_subscriptions,
    COALESCE(s.current_mrr, 0) AS current_mrr
FROM {{ ref('slv_users') }} u
LEFT JOIN sub_stats s ON u.user_id = s.user_id
`,
      "fct_subscriptions.sql": `-- Gold: subscription fact with revenue metrics
SELECT
    s.subscription_id, s.user_id, s.plan, s.status,
    s.started_at, s.ended_at, s.mrr_amount, s.billing_interval,
    COALESCE(SUM(i.amount), 0) AS total_invoiced
FROM {{ ref('slv_subscriptions') }} s
LEFT JOIN {{ ref('slv_invoices') }} i ON s.subscription_id = i.subscription_id
GROUP BY s.subscription_id, s.user_id, s.plan, s.status,
    s.started_at, s.ended_at, s.mrr_amount, s.billing_interval
`,
      "gld_mrr_summary.sql": `-- Gold: monthly MRR summary
SELECT
    DATE_TRUNC('month', started_at) AS month,
    COUNT(DISTINCT user_id) AS active_subscribers,
    SUM(mrr_amount) AS total_mrr,
    AVG(mrr_amount) AS avg_mrr
FROM {{ ref('slv_subscriptions') }}
WHERE status = 'active'
GROUP BY DATE_TRUNC('month', started_at)
ORDER BY month
`,
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
    silverModels: {
      "slv_accounts.sql": `-- Silver: standardised chart of accounts
SELECT
    account_id, account_name, account_type, parent_account_id,
    is_active, currency
FROM {{ ref('brz_accounts') }}
WHERE is_active = true
`,
      "slv_transactions.sql": `-- Silver: validated financial transactions
SELECT
    transaction_id, account_id,
    transaction_date::DATE AS transaction_date,
    debit_amount, credit_amount,
    description, reference,
    created_at::TIMESTAMP AS created_at
FROM {{ ref('brz_transactions') }}
WHERE debit_amount > 0 OR credit_amount > 0
`,
      "slv_journals.sql": `-- Silver: normalised journal entries
SELECT
    journal_id, journal_date::DATE AS journal_date,
    description, posted_by,
    is_posted, created_at::TIMESTAMP AS created_at
FROM {{ ref('brz_journals') }}
`,
      "slv_budgets.sql": `-- Silver: cleaned budget line items
SELECT
    budget_id, account_id, period,
    budget_amount, actual_amount,
    cost_centre, fiscal_year
FROM {{ ref('brz_budgets') }}
WHERE budget_amount IS NOT NULL
`,
    },
    goldModels: {
      "dim_accounts.sql": `-- Gold: account dimension with balance summaries
WITH balances AS (
    SELECT account_id,
        SUM(debit_amount) AS total_debits,
        SUM(credit_amount) AS total_credits
    FROM {{ ref('slv_transactions') }}
    GROUP BY account_id
)
SELECT
    a.account_id, a.account_name, a.account_type, a.currency,
    COALESCE(b.total_debits, 0) AS total_debits,
    COALESCE(b.total_credits, 0) AS total_credits,
    COALESCE(b.total_debits, 0) - COALESCE(b.total_credits, 0) AS net_balance
FROM {{ ref('slv_accounts') }} a
LEFT JOIN balances b ON a.account_id = b.account_id
`,
      "fct_transactions.sql": `-- Gold: transaction fact with account details
SELECT
    t.transaction_id, t.account_id, t.transaction_date,
    t.debit_amount, t.credit_amount, t.description,
    a.account_name, a.account_type
FROM {{ ref('slv_transactions') }} t
JOIN {{ ref('slv_accounts') }} a ON t.account_id = a.account_id
`,
      "gld_budget_variance.sql": `-- Gold: budget vs actual variance by account
SELECT
    b.account_id, a.account_name, a.account_type,
    b.period, b.fiscal_year, b.cost_centre,
    b.budget_amount, b.actual_amount,
    b.actual_amount - b.budget_amount AS variance,
    ROUND((b.actual_amount - b.budget_amount) / NULLIF(b.budget_amount, 0) * 100, 1) AS variance_pct
FROM {{ ref('slv_budgets') }} b
JOIN {{ ref('slv_accounts') }} a ON b.account_id = a.account_id
`,
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
