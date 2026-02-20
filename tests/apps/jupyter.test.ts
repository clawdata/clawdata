import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const JUPYTER_DIR = path.resolve(import.meta.dirname, "../../apps/jupyter");

describe("Jupyter notebook environment", () => {
  it("README.md exists with setup instructions", async () => {
    const content = await fs.readFile(path.join(JUPYTER_DIR, "README.md"), "utf-8");
    expect(content).toContain("jupyter lab");
    expect(content).toContain("CLAWDATA_DB_PATH");
  });

  it("requirements.txt lists jupyterlab and duckdb", async () => {
    const content = await fs.readFile(path.join(JUPYTER_DIR, "requirements.txt"), "utf-8");
    expect(content).toContain("jupyterlab");
    expect(content).toContain("duckdb");
    expect(content).toContain("pandas");
  });

  it("helpers.py provides connect and query_df", async () => {
    const content = await fs.readFile(path.join(JUPYTER_DIR, "helpers.py"), "utf-8");
    expect(content).toContain("def connect");
    expect(content).toContain("def query_df");
    expect(content).toContain("def list_tables");
    expect(content).toContain("def profile_table");
    expect(content).toContain("def sample");
  });

  it("helpers.py references CLAWDATA_DB_PATH env var", async () => {
    const content = await fs.readFile(path.join(JUPYTER_DIR, "helpers.py"), "utf-8");
    expect(content).toContain("CLAWDATA_DB_PATH");
  });

  it("01_explore.ipynb is valid JSON with cells", async () => {
    const raw = await fs.readFile(path.join(JUPYTER_DIR, "01_explore.ipynb"), "utf-8");
    const nb = JSON.parse(raw);
    expect(nb.nbformat).toBe(4);
    expect(nb.cells.length).toBeGreaterThanOrEqual(4);
    expect(nb.cells[0].cell_type).toBe("markdown");
  });

  it("02_profiling.ipynb contains profiling imports", async () => {
    const raw = await fs.readFile(path.join(JUPYTER_DIR, "02_profiling.ipynb"), "utf-8");
    const nb = JSON.parse(raw);
    expect(nb.nbformat).toBe(4);
    const allSource = nb.cells.map((c: any) => c.source.join("")).join("\n");
    expect(allSource).toContain("profile_table");
    expect(allSource).toContain("matplotlib");
  });

  it("03_model_dev.ipynb contains model prototype workflow", async () => {
    const raw = await fs.readFile(path.join(JUPYTER_DIR, "03_model_dev.ipynb"), "utf-8");
    const nb = JSON.parse(raw);
    expect(nb.nbformat).toBe(4);
    const allSource = nb.cells.map((c: any) => c.source.join("")).join("\n");
    expect(allSource).toContain("model_sql");
    expect(allSource).toContain("ref(");
  });

  it("has at least 3 notebook files", async () => {
    const files = await fs.readdir(JUPYTER_DIR);
    const notebooks = files.filter((f) => f.endsWith(".ipynb"));
    expect(notebooks.length).toBeGreaterThanOrEqual(3);
  });

  it("all notebooks have Python 3 kernel spec", async () => {
    const files = await fs.readdir(JUPYTER_DIR);
    const notebooks = files.filter((f) => f.endsWith(".ipynb"));
    for (const nb of notebooks) {
      const raw = await fs.readFile(path.join(JUPYTER_DIR, nb), "utf-8");
      const data = JSON.parse(raw);
      expect(data.metadata.kernelspec.language).toBe("python");
    }
  });
});
