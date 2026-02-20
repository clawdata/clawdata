import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const SEEDS_DIR = path.resolve("apps/dbt/seeds");

describe("dbt seed files", () => {
  it("country_codes.csv should exist with expected columns", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "country_codes.csv"),
      "utf-8"
    );
    const header = content.split("\n")[0];
    expect(header).toContain("country_code");
    expect(header).toContain("country_name");
    expect(header).toContain("region");
  });

  it("country_codes.csv should have at least 10 entries", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "country_codes.csv"),
      "utf-8"
    );
    const rows = content.trim().split("\n").slice(1); // skip header
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("currency_codes.csv should exist with expected columns", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "currency_codes.csv"),
      "utf-8"
    );
    const header = content.split("\n")[0];
    expect(header).toContain("currency_code");
    expect(header).toContain("currency_name");
    expect(header).toContain("symbol");
    expect(header).toContain("decimal_places");
  });

  it("currency_codes.csv should have at least 8 entries", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "currency_codes.csv"),
      "utf-8"
    );
    const rows = content.trim().split("\n").slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it("order_statuses.csv should exist with expected columns", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "order_statuses.csv"),
      "utf-8"
    );
    const header = content.split("\n")[0];
    expect(header).toContain("order_status");
    expect(header).toContain("description");
    expect(header).toContain("is_terminal");
  });

  it("order_statuses.csv should contain pending, completed, refunded", async () => {
    const content = await fs.readFile(
      path.join(SEEDS_DIR, "order_statuses.csv"),
      "utf-8"
    );
    expect(content).toContain("pending");
    expect(content).toContain("completed");
    expect(content).toContain("refunded");
  });

  it("dbt_project.yml should have seed config", async () => {
    const content = await fs.readFile(
      path.resolve("apps/dbt/dbt_project.yml"),
      "utf-8"
    );
    expect(content).toContain("seeds:");
    expect(content).toContain("country_codes:");
    expect(content).toContain("currency_codes:");
    expect(content).toContain("order_statuses:");
  });
});
