/**
 * `clawdata run` — one-command full pipeline: ingest → dbt run → dbt test.
 */

import { DatabaseManager } from "../lib/database.js";
import { DbtManager } from "../lib/dbt.js";
import { DataIngestor } from "../lib/ingestor.js";
import { jsonMode, output } from "../lib/output.js";

export interface PipelineStepResult {
  step: string;
  success: boolean;
  message: string;
  durationMs: number;
}

export interface PipelineResult {
  success: boolean;
  steps: PipelineStepResult[];
  totalDurationMs: number;
}

export async function runCommand(
  sub: string | undefined,
  _rest: string[],
  ingestor: DataIngestor,
  dbtManager: DbtManager,
  _dbManager: DatabaseManager
): Promise<void> {
  if (sub === "help" || sub === "--help" || sub === "-h") {
    console.log("Usage: clawdata run\n");
    console.log("Runs the full pipeline: ingest all data → dbt run → dbt test");
    console.log("Equivalent to running these commands in sequence:");
    console.log("  clawdata data ingest-all");
    console.log("  clawdata dbt run");
    console.log("  clawdata dbt test");
    return;
  }

  const pipelineStart = Date.now();
  const steps: PipelineStepResult[] = [];
  let pipelineOk = true;

  // Step 1: Ingest
  if (!jsonMode) console.log("⏳ Step 1/3 — Ingesting data…");
  const ingestStart = Date.now();
  try {
    const result = await ingestor.ingestAll();
    const lines = result.split("\n").filter(Boolean);
    steps.push({
      step: "ingest",
      success: true,
      message: `${lines.length} file(s) loaded`,
      durationMs: Date.now() - ingestStart,
    });
    if (!jsonMode) console.log(`✓ Ingest complete — ${lines.length} file(s) (${Date.now() - ingestStart}ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "ingest", success: false, message: msg, durationMs: Date.now() - ingestStart });
    pipelineOk = false;
    if (!jsonMode) console.log(`✗ Ingest failed — ${msg}`);
  }

  // Step 2: dbt run
  if (pipelineOk) {
    if (!jsonMode) console.log("⏳ Step 2/3 — Running dbt models…");
    const dbtStart = Date.now();
    const result = await dbtManager.run();
    steps.push({
      step: "dbt-run",
      success: result.success,
      message: result.success ? "All models built" : result.output.slice(0, 200),
      durationMs: Date.now() - dbtStart,
    });
    if (result.success) {
      if (!jsonMode) console.log(`✓ dbt run complete (${Date.now() - dbtStart}ms)`);
    } else {
      pipelineOk = false;
      if (!jsonMode) console.log(`✗ dbt run failed`);
    }
  }

  // Step 3: dbt test
  if (pipelineOk) {
    if (!jsonMode) console.log("⏳ Step 3/3 — Running dbt tests…");
    const testStart = Date.now();
    const result = await dbtManager.test();
    steps.push({
      step: "dbt-test",
      success: result.success,
      message: result.success ? "All tests passed" : result.output.slice(0, 200),
      durationMs: Date.now() - testStart,
    });
    if (result.success) {
      if (!jsonMode) console.log(`✓ dbt test complete (${Date.now() - testStart}ms)`);
    } else {
      pipelineOk = false;
      if (!jsonMode) console.log(`✗ dbt test failed`);
    }
  }

  const totalMs = Date.now() - pipelineStart;
  const pipelineResult: PipelineResult = {
    success: pipelineOk,
    steps,
    totalDurationMs: totalMs,
  };

  if (jsonMode) {
    output(pipelineResult);
  } else {
    console.log(
      pipelineOk
        ? `\n✓ Pipeline complete (${totalMs}ms)`
        : `\n✗ Pipeline failed (${totalMs}ms) — see errors above`
    );
  }

  if (!pipelineOk) process.exit(1);
}
