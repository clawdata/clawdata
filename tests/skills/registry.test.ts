import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const SKILLS_DIR = path.resolve(import.meta.dirname, "../../skills");

const EXPECTED_SKILLS = [
  "duckdb",
  "dbt",
  "airflow",
  "snowflake",
  "s3",
  "great-expectations",
  "dlt",
  "dagster",
  "kafka",
  "postgres",
  "bigquery",
  "databricks",
  "spark",
  "fivetran",
  "metabase",
];

describe("Skills registry", () => {
  it("has all expected skill directories", async () => {
    const dirs = await fs.readdir(SKILLS_DIR);
    for (const skill of EXPECTED_SKILLS) {
      expect(dirs).toContain(skill);
    }
  });

  for (const skill of EXPECTED_SKILLS) {
    describe(`skills/${skill}`, () => {
      it("has SKILL.md", async () => {
        const stat = await fs.stat(path.join(SKILLS_DIR, skill, "SKILL.md"));
        expect(stat.isFile()).toBe(true);
      });

      it("SKILL.md has frontmatter with name", async () => {
        const content = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
        expect(content).toMatch(/^---\n/);
        expect(content).toContain("name:");
      });

      it("SKILL.md has description in frontmatter", async () => {
        const content = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
        expect(content).toContain("description:");
      });

      it("SKILL.md has metadata tags", async () => {
        const content = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
        expect(content).toContain("tags:");
      });

      it("SKILL.md has commands table", async () => {
        const content = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
        // Every skill should have a commands/usage section with a table
        expect(content).toContain("| Task");
      });

      it("SKILL.md has 'When to use' section", async () => {
        const content = await fs.readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf-8");
        expect(content.toLowerCase()).toContain("when to use");
      });
    });
  }
});
