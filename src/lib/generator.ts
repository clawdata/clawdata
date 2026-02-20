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
