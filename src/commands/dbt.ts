/**
 * `clawdata dbt` subcommands — run, test, compile, seed, docs, debug, models.
 */

import { DbtManager } from "../lib/dbt.js";
import { jsonMode, output, die } from "../lib/output.js";

function parseModelsFlag(args: string[]): string[] | undefined {
  const idx = args.indexOf("--models");
  if (idx === -1) return undefined;
  return args.slice(idx + 1).filter((a) => !a.startsWith("--"));
}

export async function dbtCommand(
  sub: string | undefined,
  rest: string[],
  dbtManager: DbtManager
): Promise<void> {
  switch (sub) {
    case "run": {
      const models = parseModelsFlag(rest);
      const result = await dbtManager.run(models);
      if (jsonMode) { output(result); } else { console.log(result.output); }
      if (!result.success) process.exit(1);
      return;
    }
    case "test": {
      const models = parseModelsFlag(rest);
      const result = await dbtManager.test(models);
      if (jsonMode) { output(result); } else { console.log(result.output); }
      if (!result.success) process.exit(1);
      return;
    }
    case "compile": {
      const result = await dbtManager.compile();
      if (jsonMode) { output(result); } else { console.log(result.output); }
      if (!result.success) process.exit(1);
      return;
    }
    case "seed": {
      const result = await dbtManager.seed();
      if (jsonMode) { output(result); } else { console.log(result.output); }
      if (!result.success) process.exit(1);
      return;
    }
    case "docs": {
      const serve = rest.includes("--serve");
      const portIdx = rest.indexOf("--port");
      const port = portIdx !== -1 ? parseInt(rest[portIdx + 1], 10) : 8080;
      if (serve) {
        console.log(`Generating docs and serving on http://localhost:${port} …`);
        const result = await dbtManager.docsServe(port);
        if (jsonMode) { output(result); } else { console.log(result.output); }
        if (!result.success) process.exit(1);
      } else {
        const result = await dbtManager.docs();
        if (jsonMode) { output(result); } else { console.log(result.output); }
        if (!result.success) process.exit(1);
      }
      return;
    }
    case "debug": {
      const result = await dbtManager.debug();
      if (jsonMode) { output(result); } else { console.log(result.output); }
      if (!result.success) process.exit(1);
      return;
    }
    case "models": {
      const models = await dbtManager.listModels();
      if (jsonMode) {
        output({ models, count: models.length });
      } else if (!models.length) {
        console.log("No models found. Run `dbt compile` first.");
      } else {
        console.log("dbt models:");
        models.forEach((m) => console.log(`  • ${m}`));
      }
      return;
    }
    case "lineage": {
      const lineage = await dbtManager.getLineage();
      if (jsonMode) {
        output(lineage);
        return;
      }
      if (!lineage.nodes.length) {
        console.log("No model lineage found. Run `dbt compile` first.");
        return;
      }

      // Build adjacency for ASCII rendering
      const nameOf = (key: string) => lineage.nodes.find((n) => n.key === key)?.name || key;
      const roots = new Set(lineage.nodes.map((n) => n.key));
      for (const edge of lineage.edges) {
        roots.delete(edge.to);
      }

      // Simple tree renderer
      const children = new Map<string, string[]>();
      for (const edge of lineage.edges) {
        if (!children.has(edge.from)) children.set(edge.from, []);
        children.get(edge.from)!.push(edge.to);
      }

      function printTree(node: string, prefix: string, isLast: boolean): void {
        const connector = prefix === "" ? "" : isLast ? "└── " : "├── ";
        console.log(`${prefix}${connector}${nameOf(node)}`);
        const kids = children.get(node) || [];
        kids.forEach((child, i) => {
          const newPrefix = prefix === "" ? "" : prefix + (isLast ? "    " : "│   ");
          printTree(child, newPrefix, i === kids.length - 1);
        });
      }

      console.log("dbt model lineage:\n");
      const rootList = [...roots];
      rootList.forEach((root, i) => printTree(root, "", i === rootList.length - 1));
      console.log(`\n${lineage.nodes.length} model(s), ${lineage.edges.length} edge(s)`);
      return;
    }
    default:
      if (sub) {
        console.error(`Error: Unknown dbt command: ${sub}\n`);
      }
      console.log("Usage: clawdata dbt <command>\n");
      console.log("Commands:");
      console.log("  run   [--models m1 m2]   Materialise dbt models");
      console.log("  test  [--models m1 m2]   Run schema & data tests");
      console.log("  compile                  Compile models to raw SQL");
      console.log("  seed                     Load seed CSVs into DuckDB");
      console.log("  docs [--serve] [--port N] Generate (and optionally serve) dbt documentation");
      console.log("  debug                    Verify dbt connection & config");
      console.log("  models                   List available models");
      console.log("  lineage                  Show model dependency graph");
      console.log("\nExamples:");
      console.log("  clawdata dbt run");
      console.log("  clawdata dbt run --models slv_customers dim_customers");
      console.log("  clawdata dbt test");
      console.log("  clawdata dbt models");
      if (sub) process.exit(1);
      return;
  }
}
