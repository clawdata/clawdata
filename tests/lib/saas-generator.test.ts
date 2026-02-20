import { describe, it, expect, afterEach } from "vitest";
import { generateSaasData } from "../../src/lib/generator.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("SaaS sample dataset generator", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(rows = 50, seed = 42) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-saas-"));
    return generateSaasData({ rows, outputDir: tmpDir, seed });
  }

  it("generates 4 CSV files", () => {
    const result = setup();
    expect(result.files).toHaveLength(4);
    expect(result.files.map((f) => path.basename(f)).sort()).toEqual([
      "saas_events.csv",
      "saas_invoices.csv",
      "saas_subscriptions.csv",
      "saas_users.csv",
    ]);
  });

  it("users CSV has correct headers", () => {
    setup();
    const csv = fs.readFileSync(path.join(tmpDir, "saas_users.csv"), "utf-8");
    const header = csv.split("\n")[0];
    expect(header).toBe("user_id,email,display_name,signup_date,company");
  });

  it("subscriptions CSV has correct headers", () => {
    setup();
    const csv = fs.readFileSync(path.join(tmpDir, "saas_subscriptions.csv"), "utf-8");
    const header = csv.split("\n")[0];
    expect(header).toBe("subscription_id,user_id,plan,billing_cycle,status,start_date,mrr");
  });

  it("events CSV has correct headers", () => {
    setup();
    const csv = fs.readFileSync(path.join(tmpDir, "saas_events.csv"), "utf-8");
    const header = csv.split("\n")[0];
    expect(header).toBe("event_id,user_id,event_type,timestamp,properties");
  });

  it("invoices CSV has correct headers", () => {
    setup();
    const csv = fs.readFileSync(path.join(tmpDir, "saas_invoices.csv"), "utf-8");
    const header = csv.split("\n")[0];
    expect(header).toBe("invoice_id,user_id,amount,currency,status,issued_date,due_date");
  });

  it("generates correct number of data rows for users", () => {
    setup(100);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_users.csv"), "utf-8");
    const rows = csv.trim().split("\n");
    // 20% of 100 = 20 users + 1 header
    expect(rows.length).toBe(21);
  });

  it("generates correct number of event rows", () => {
    setup(100);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_events.csv"), "utf-8");
    const rows = csv.trim().split("\n");
    // 100 events + 1 header
    expect(rows.length).toBe(101);
  });

  it("subscriptions reference valid plans", () => {
    setup(50);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_subscriptions.csv"), "utf-8");
    const rows = csv.trim().split("\n").slice(1);
    const validPlans = ["Free", "Starter", "Pro", "Enterprise"];
    for (const row of rows) {
      const plan = row.split(",")[2];
      expect(validPlans).toContain(plan);
    }
  });

  it("invoices have USD currency", () => {
    setup(50);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_invoices.csv"), "utf-8");
    const rows = csv.trim().split("\n").slice(1);
    for (const row of rows) {
      const currency = row.split(",")[3];
      expect(currency).toBe("USD");
    }
  });

  it("is deterministic with same seed", () => {
    const result1 = setup(30, 123);
    const files1 = result1.files.map((f) => fs.readFileSync(f, "utf-8"));
    fs.rmSync(tmpDir, { recursive: true, force: true });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-saas-"));
    generateSaasData({ rows: 30, outputDir: tmpDir, seed: 123 });
    const files2 = result1.files.map((_, i) => {
      const basename = path.basename(result1.files[i]);
      return fs.readFileSync(path.join(tmpDir, basename), "utf-8");
    });

    expect(files1).toEqual(files2);
  });

  it("events reference valid event types", () => {
    setup(50);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_events.csv"), "utf-8");
    const rows = csv.trim().split("\n").slice(1);
    const validTypes = ["login", "page_view", "feature_use", "api_call", "export", "invite_sent"];
    for (const row of rows) {
      const eventType = row.split(",")[2];
      expect(validTypes).toContain(eventType);
    }
  });

  it("subscription IDs have correct format", () => {
    setup(20);
    const csv = fs.readFileSync(path.join(tmpDir, "saas_subscriptions.csv"), "utf-8");
    const rows = csv.trim().split("\n").slice(1);
    for (const row of rows) {
      const subId = row.split(",")[0];
      expect(subId).toMatch(/^SUB-\d{5}$/);
    }
  });
});
