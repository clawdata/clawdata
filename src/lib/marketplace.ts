/**
 * Dataset marketplace — browse, search, and download curated datasets.
 *
 * Provides a built-in registry of public datasets with metadata.
 * Users can:
 *   clawdata data add <dataset>      Download a dataset to data/sample/
 *   clawdata data marketplace        List all available datasets
 *   clawdata data marketplace search <query>  Search by keyword
 */

import * as fs from "fs/promises";
import * as path from "path";
import { jsonMode, output } from "../lib/output.js";

export interface DatasetEntry {
  id: string;
  name: string;
  description: string;
  format: "csv" | "json" | "parquet";
  files: string[];
  tags: string[];
  rows: string;
  source?: string;
  url?: string;
}

/**
 * Built-in dataset registry. URLs point to well-known public datasets.
 * For production, this could be fetched from a remote API.
 */
export const DATASET_REGISTRY: DatasetEntry[] = [
  {
    id: "titanic",
    name: "Titanic Passengers",
    description: "Classic ML dataset — passenger survival data from the Titanic",
    format: "csv",
    files: ["titanic.csv"],
    tags: ["classification", "historical", "starter"],
    rows: "~891",
    source: "Kaggle",
    url: "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
  },
  {
    id: "iris",
    name: "Iris Flower Dataset",
    description: "Fisher's classic dataset — 150 flowers, 4 features, 3 species",
    format: "csv",
    files: ["iris.csv"],
    tags: ["classification", "starter", "ml"],
    rows: "150",
    source: "UCI ML Repository",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv",
  },
  {
    id: "nyc-taxi",
    name: "NYC Taxi Trips (sample)",
    description: "Sample of NYC yellow taxi trip records — pickup/dropoff, fare, tips",
    format: "parquet",
    files: ["nyc_taxi_sample.parquet"],
    tags: ["geospatial", "timeseries", "large"],
    rows: "~100k",
    source: "NYC TLC",
  },
  {
    id: "world-gdp",
    name: "World GDP by Country",
    description: "Annual GDP figures by country from the World Bank",
    format: "csv",
    files: ["world_gdp.csv"],
    tags: ["economics", "timeseries", "reference"],
    rows: "~15k",
    source: "World Bank",
  },
  {
    id: "ecommerce-sample",
    name: "E-commerce Transactions",
    description: "ClawData built-in e-commerce dataset (customers, orders, products, payments)",
    format: "csv",
    files: ["sample_customers.csv", "sample_orders.csv", "sample_products.csv", "sample_payments.csv"],
    tags: ["ecommerce", "starter", "builtin"],
    rows: "~1000",
    source: "ClawData Generator",
  },
  {
    id: "saas-metrics",
    name: "SaaS Metrics",
    description: "ClawData built-in SaaS dataset (users, subscriptions, events, invoices)",
    format: "csv",
    files: ["saas_users.csv", "saas_subscriptions.csv", "saas_events.csv", "saas_invoices.csv"],
    tags: ["saas", "starter", "builtin"],
    rows: "~1000",
    source: "ClawData Generator",
  },
  {
    id: "weather-daily",
    name: "Daily Weather Observations",
    description: "Multi-city daily weather: temperature, humidity, precipitation",
    format: "csv",
    files: ["weather_daily.csv"],
    tags: ["timeseries", "iot", "environmental"],
    rows: "~50k",
    source: "NOAA",
  },
  {
    id: "financial-txns",
    name: "Financial Transactions",
    description: "Synthetic bank transactions for fraud detection and analytics",
    format: "csv",
    files: ["financial_transactions.csv"],
    tags: ["financial", "fraud", "synthetic"],
    rows: "~10k",
    source: "Synthetic",
  },
];

/**
 * Search datasets by keyword (matches id, name, description, tags).
 */
export function searchDatasets(query: string): DatasetEntry[] {
  const q = query.toLowerCase();
  return DATASET_REGISTRY.filter(
    (d) =>
      d.id.includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.tags.some((t) => t.includes(q))
  );
}

/**
 * Get a single dataset entry by ID.
 */
export function getDataset(id: string): DatasetEntry | undefined {
  return DATASET_REGISTRY.find((d) => d.id === id);
}

/**
 * List all available datasets.
 */
export function listDatasets(): DatasetEntry[] {
  return [...DATASET_REGISTRY];
}

/**
 * Download a dataset to the target directory.
 * For built-in datasets, generates them via the generator.
 * For remote datasets with URLs, would use fetch/httpfs.
 * Returns list of written file paths.
 */
export async function downloadDataset(
  id: string,
  targetDir: string
): Promise<{ files: string[]; source: string }> {
  const dataset = getDataset(id);
  if (!dataset) {
    throw new Error(`Unknown dataset: ${id}. Run 'clawdata data marketplace' to see available datasets.`);
  }

  await fs.mkdir(targetDir, { recursive: true });

  // Built-in datasets use the generator
  if (dataset.source === "ClawData Generator") {
    if (dataset.id === "ecommerce-sample") {
      const { generateSampleData } = await import("../lib/generator.js");
      const result = generateSampleData({ rows: 200, outputDir: targetDir });
      return { files: result.files, source: "generated" };
    }
    if (dataset.id === "saas-metrics") {
      const { generateSaasData } = await import("../lib/generator.js");
      const result = generateSaasData({ rows: 200, outputDir: targetDir });
      return { files: result.files, source: "generated" };
    }
  }

  // Remote datasets with URL — write a placeholder manifest
  // In production this would use fetch() or DuckDB httpfs
  const manifest = {
    dataset: dataset.id,
    name: dataset.name,
    format: dataset.format,
    files: dataset.files,
    url: dataset.url || "(no direct URL — check source)",
    downloadedAt: new Date().toISOString(),
  };

  const manifestPath = path.join(targetDir, `${dataset.id}.dataset.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  return { files: [manifestPath], source: "manifest" };
}

export async function marketplaceCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  switch (sub) {
    case "search": {
      const query = rest[0];
      if (!query) {
        console.error("Usage: clawdata data marketplace search <query>");
        process.exit(1);
      }
      const results = searchDatasets(query);
      if (jsonMode) {
        output({ query, results, count: results.length });
      } else if (!results.length) {
        console.log(`No datasets found for "${query}".`);
      } else {
        console.log(`Datasets matching "${query}":\n`);
        for (const d of results) {
          console.log(`  ${d.id.padEnd(20)} ${d.name}`);
          console.log(`  ${"".padEnd(20)} ${d.description}`);
          console.log(`  ${"".padEnd(20)} tags: ${d.tags.join(", ")}  rows: ${d.rows}\n`);
        }
      }
      return;
    }

    default: {
      // List all datasets
      const datasets = listDatasets();
      if (jsonMode) {
        output({ datasets, count: datasets.length });
      } else {
        console.log("Available datasets:\n");
        for (const d of datasets) {
          console.log(`  ${d.id.padEnd(20)} ${d.name} (${d.rows} rows, ${d.format})`);
          console.log(`  ${"".padEnd(20)} ${d.description}\n`);
        }
        console.log('Download with: clawdata data add <dataset-id>');
      }
      return;
    }
  }
}
