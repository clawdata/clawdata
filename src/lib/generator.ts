import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface GenerateOptions {
  rows: number;
  outputDir: string;
  seed?: number;
}

/** Simple seeded pseudo-random number generator (mulberry32). */
function prng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
const LAST_NAMES = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'White'];
const COUNTRIES = ['US', 'GB', 'AU', 'DE', 'FR', 'CA', 'NZ', 'JP', 'BR', 'IN'];
const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys'];
const PAYMENT_METHODS = ['Credit Card', 'PayPal', 'Bank Transfer', 'Apple Pay'];
const STATUSES = ['completed', 'shipped', 'pending', 'refunded'];
const PAYMENT_STATUSES = ['completed', 'pending', 'refunded'];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function generateCustomers(rows: number, rand: () => number): string {
  const lines = ['customer_id,first_name,last_name,email,country'];
  for (let i = 1; i <= rows; i++) {
    const first = pick(FIRST_NAMES, rand);
    const last = pick(LAST_NAMES, rand);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`;
    const country = pick(COUNTRIES, rand);
    lines.push(`${i},${first},${last},${email},${country}`);
  }
  return lines.join('\n') + '\n';
}

function generateProducts(rows: number, rand: () => number): string {
  const lines = ['product_sku,product_name,category,price,cost'];
  for (let i = 1; i <= rows; i++) {
    const cat = pick(CATEGORIES, rand);
    const name = `${cat} Item ${i}`;
    const price = (10 + rand() * 490).toFixed(2);
    const cost = (Number(price) * (0.3 + rand() * 0.4)).toFixed(2);
    lines.push(`SKU-${String(i).padStart(4, '0')},${name},${cat},${price},${cost}`);
  }
  return lines.join('\n') + '\n';
}

function generateOrders(rows: number, numCustomers: number, numProducts: number, rand: () => number): { orders: string; payments: string } {
  const orderLines = ['order_id,customer_id,product_sku,quantity,order_date,status'];
  const paymentLines = ['transaction_id,order_id,amount,payment_method,payment_status'];

  for (let i = 1; i <= rows; i++) {
    const customerId = Math.floor(rand() * numCustomers) + 1;
    const productSku = `SKU-${String(Math.floor(rand() * numProducts) + 1).padStart(4, '0')}`;
    const qty = Math.floor(rand() * 5) + 1;
    const year = 2023 + Math.floor(rand() * 2);
    const month = String(Math.floor(rand() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, '0');
    const status = pick(STATUSES, rand);
    orderLines.push(`ORD-${String(i).padStart(5, '0')},${customerId},${productSku},${qty},${year}-${month}-${day},${status}`);

    const amount = (10 + rand() * 490).toFixed(2);
    const method = pick(PAYMENT_METHODS, rand);
    const pStatus = pick(PAYMENT_STATUSES, rand);
    paymentLines.push(`TXN-${String(i).padStart(5, '0')},ORD-${String(i).padStart(5, '0')},${amount},${method},${pStatus}`);
  }

  return { orders: orderLines.join('\n') + '\n', payments: paymentLines.join('\n') + '\n' };
}

export function generateSampleData(options: GenerateOptions): { files: string[] } {
  const { rows, outputDir, seed = 42 } = options;
  const rand = prng(seed);

  mkdirSync(outputDir, { recursive: true });

  const customerRows = Math.max(1, Math.ceil(rows * 0.2));
  const productRows = Math.max(1, Math.ceil(rows * 0.1));
  const orderRows = rows;

  const customers = generateCustomers(customerRows, rand);
  const products = generateProducts(productRows, rand);
  const { orders, payments } = generateOrders(orderRows, customerRows, productRows, rand);

  const files: string[] = [];

  const write = (name: string, data: string) => {
    const p = join(outputDir, name);
    writeFileSync(p, data);
    files.push(p);
  };

  write('sample_customers.csv', customers);
  write('sample_products.csv', products);
  write('sample_orders.csv', orders);
  write('sample_payments.csv', payments);

  return { files };
}

/* ── SaaS dataset ─────────────────────────────────────────────────── */

const PLAN_NAMES = ['Free', 'Starter', 'Pro', 'Enterprise'];
const PLAN_PRICES: Record<string, number> = { Free: 0, Starter: 29, Pro: 99, Enterprise: 499 };
const BILLING_CYCLES = ['monthly', 'annual'];
const EVENT_TYPES = ['login', 'page_view', 'feature_use', 'api_call', 'export', 'invite_sent'];
const INVOICE_STATUSES = ['paid', 'pending', 'overdue', 'void'];
const SUB_STATUSES = ['active', 'trialing', 'canceled', 'past_due'];

function generateSaasUsers(rows: number, rand: () => number): string {
  const lines = ['user_id,email,display_name,signup_date,company'];
  const companies = ['Acme Corp', 'Globex Inc', 'Initech', 'Umbrella LLC', 'Wayne Enterprises', 'Stark Industries', 'Hooli', 'Pied Piper'];
  for (let i = 1; i <= rows; i++) {
    const first = pick(FIRST_NAMES, rand);
    const last = pick(LAST_NAMES, rand);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@company.io`;
    const company = pick(companies, rand);
    const year = 2022 + Math.floor(rand() * 3);
    const month = String(Math.floor(rand() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, '0');
    lines.push(`${i},${email},${first} ${last},${year}-${month}-${day},${company}`);
  }
  return lines.join('\n') + '\n';
}

function generateSaasSubscriptions(rows: number, numUsers: number, rand: () => number): string {
  const lines = ['subscription_id,user_id,plan,billing_cycle,status,start_date,mrr'];
  for (let i = 1; i <= rows; i++) {
    const userId = Math.floor(rand() * numUsers) + 1;
    const plan = pick(PLAN_NAMES, rand);
    const cycle = pick(BILLING_CYCLES, rand);
    const status = pick(SUB_STATUSES, rand);
    const year = 2022 + Math.floor(rand() * 3);
    const month = String(Math.floor(rand() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, '0');
    const mrr = cycle === 'annual'
      ? (PLAN_PRICES[plan] * 0.8).toFixed(2)
      : PLAN_PRICES[plan].toFixed(2);
    lines.push(`SUB-${String(i).padStart(5, '0')},${userId},${plan},${cycle},${status},${year}-${month}-${day},${mrr}`);
  }
  return lines.join('\n') + '\n';
}

function generateSaasEvents(rows: number, numUsers: number, rand: () => number): string {
  const lines = ['event_id,user_id,event_type,timestamp,properties'];
  for (let i = 1; i <= rows; i++) {
    const userId = Math.floor(rand() * numUsers) + 1;
    const eventType = pick(EVENT_TYPES, rand);
    const year = 2023 + Math.floor(rand() * 2);
    const month = String(Math.floor(rand() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, '0');
    const hour = String(Math.floor(rand() * 24)).padStart(2, '0');
    const min = String(Math.floor(rand() * 60)).padStart(2, '0');
    const props = `"{""source"":""web""}"`;
    lines.push(`EVT-${String(i).padStart(6, '0')},${userId},${eventType},${year}-${month}-${day}T${hour}:${min}:00Z,${props}`);
  }
  return lines.join('\n') + '\n';
}

function generateSaasInvoices(rows: number, numUsers: number, rand: () => number): string {
  const lines = ['invoice_id,user_id,amount,currency,status,issued_date,due_date'];
  for (let i = 1; i <= rows; i++) {
    const userId = Math.floor(rand() * numUsers) + 1;
    const plan = pick(PLAN_NAMES, rand);
    const amount = PLAN_PRICES[plan].toFixed(2);
    const status = pick(INVOICE_STATUSES, rand);
    const year = 2023 + Math.floor(rand() * 2);
    const month = Math.floor(rand() * 12) + 1;
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, '0');
    const issuedDate = `${year}-${String(month).padStart(2, '0')}-${day}`;
    const dueMonth = month < 12 ? month + 1 : 1;
    const dueYear = month < 12 ? year : year + 1;
    const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${day}`;
    lines.push(`INV-${String(i).padStart(5, '0')},${userId},${amount},USD,${status},${issuedDate},${dueDate}`);
  }
  return lines.join('\n') + '\n';
}

export function generateSaasData(options: GenerateOptions): { files: string[] } {
  const { rows, outputDir, seed = 42 } = options;
  const rand = prng(seed);

  mkdirSync(outputDir, { recursive: true });

  const userRows = Math.max(1, Math.ceil(rows * 0.2));
  const subRows = Math.max(1, Math.ceil(rows * 0.3));
  const eventRows = rows;
  const invoiceRows = Math.max(1, Math.ceil(rows * 0.4));

  const users = generateSaasUsers(userRows, rand);
  const subscriptions = generateSaasSubscriptions(subRows, userRows, rand);
  const events = generateSaasEvents(eventRows, userRows, rand);
  const invoices = generateSaasInvoices(invoiceRows, userRows, rand);

  const files: string[] = [];

  const write = (name: string, data: string) => {
    const p = join(outputDir, name);
    writeFileSync(p, data);
    files.push(p);
  };

  write('saas_users.csv', users);
  write('saas_subscriptions.csv', subscriptions);
  write('saas_events.csv', events);
  write('saas_invoices.csv', invoices);

  return { files };
}
