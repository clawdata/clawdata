import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const STREAMLIT_DIR = path.resolve(import.meta.dirname, "../../apps/streamlit");

describe("Streamlit data explorer", () => {
  it("app.py exists", async () => {
    const stat = await fs.stat(path.join(STREAMLIT_DIR, "app.py"));
    expect(stat.isFile()).toBe(true);
  });

  it("app.py imports streamlit", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("import streamlit");
  });

  it("app.py connects to DuckDB", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("duckdb.connect");
  });

  it("app.py has browse, query, and profile modes", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("Browse Tables");
    expect(content).toContain("SQL Query");
    expect(content).toContain("Column Profile");
  });

  it("app.py reads DB_PATH from environment", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("CLAWDATA_DB_PATH");
  });

  it("app.py has list_tables function", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("def list_tables");
  });

  it("app.py has run_query function", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("def run_query");
  });

  it("app.py has profile_column function", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "app.py"), "utf-8");
    expect(content).toContain("def profile_column");
  });

  it("requirements.txt lists streamlit and duckdb", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "requirements.txt"), "utf-8");
    expect(content).toContain("streamlit");
    expect(content).toContain("duckdb");
  });

  it("README.md exists with usage instructions", async () => {
    const content = await fs.readFile(path.join(STREAMLIT_DIR, "README.md"), "utf-8");
    expect(content).toContain("streamlit run");
    expect(content).toContain("CLAWDATA_DB_PATH");
  });
});
