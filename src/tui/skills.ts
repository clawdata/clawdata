/**
 * Interactive TUI for selecting and linking OpenClaw skills.
 *
 * Usage:  clawdata skills
 *
 * Presents a multi-select list of available skills, detects prerequisites,
 * and symlinks chosen skills into the OpenClaw skills directory.
 */

import * as readline from "readline";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execSync } from "child_process";

// ── skill registry ───────────────────────────────────────────────────

interface SkillDef {
  name: string;
  bin: string;
  description: string;
  installHint: string;
  /** Shell commands to install this skill's dependencies. Empty = no install needed. */
  installCmds: string[];
  /** If true, check availability via `python3 -c "import <bin>"` instead of PATH lookup */
  pythonImport?: boolean;
}

const SKILLS: SkillDef[] = [
  {
    name: "duckdb",
    bin: "clawdata",
    description: "Local DuckDB queries, schemas, data ingestion",
    installHint: "npm install (already included)",
    installCmds: [],
  },
  {
    name: "dbt",
    bin: "dbt",
    description: "dbt data transformations, models, tests",
    installHint: "pip install dbt-core dbt-duckdb",
    installCmds: ["pip3 install --quiet --break-system-packages dbt-core dbt-duckdb"],
  },
  {
    name: "snowflake",
    bin: "snowsql",
    description: "Snowflake cloud warehouse via SnowSQL",
    installHint: "brew install --cask snowflake-snowsql",
    installCmds: ["brew install --cask snowflake-snowsql"],
  },
  {
    name: "airflow",
    bin: "airflow",
    description: "Apache Airflow pipeline orchestration",
    installHint: "pip install apache-airflow",
    installCmds: ["pip3 install --quiet --break-system-packages apache-airflow"],
  },
  {
    name: "postgres",
    bin: "psql",
    description: "Query and manage PostgreSQL databases",
    installHint: "brew install postgresql (or apt install postgresql-client)",
    installCmds: [],
  },
  {
    name: "bigquery",
    bin: "bq",
    description: "Google BigQuery — query, load, manage datasets",
    installHint: "brew install google-cloud-sdk",
    installCmds: ["brew install --quiet google-cloud-sdk"],
  },
  {
    name: "databricks",
    bin: "databricks",
    description: "Databricks SQL, Unity Catalog, job triggers",
    installHint: "pip install databricks-cli",
    installCmds: ["pip3 install --quiet --break-system-packages databricks-cli"],
  },
  {
    name: "spark",
    bin: "spark-submit",
    description: "Submit and monitor Apache Spark jobs",
    installHint: "brew install apache-spark",
    installCmds: ["brew install --quiet apache-spark"],
  },
  {
    name: "s3",
    bin: "aws",
    description: "Cloud storage (S3 / GCS / Azure) — list, upload, download",
    installHint: "brew install awscli",
    installCmds: ["brew install --quiet awscli"],
  },
  {
    name: "kafka",
    bin: "kafka-topics",
    description: "Produce/consume messages, topic management, consumer lag",
    installHint: "brew install kafka",
    installCmds: ["brew install --quiet kafka"],
  },
  {
    name: "dlt",
    bin: "dlt",
    description: "Declarative ingestion pipelines with 100+ source connectors",
    installHint: "pip install dlt",
    installCmds: ["pip3 install --quiet --break-system-packages dlt"],
  },
  {
    name: "dagster",
    bin: "dagster",
    description: "Asset-based orchestration, sensors, schedules",
    installHint: "pip install dagster dagster-webserver",
    installCmds: ["pip3 install --quiet --break-system-packages dagster dagster-webserver"],
  },
  {
    name: "fivetran",
    bin: "curl",
    description: "Managed connectors (Fivetran / Airbyte) — trigger syncs, status",
    installHint: "API-based — configure FIVETRAN_API_KEY",
    installCmds: [],
  },
  {
    name: "great-expectations",
    bin: "great_expectations",
    pythonImport: true,
    description: "Data quality validation — suites, checkpoints, results",
    installHint: "pip install great-expectations",
    installCmds: ["pip3 install --quiet --break-system-packages great-expectations"],
  },
  {
    name: "metabase",
    bin: "docker",
    description: "BI dashboards (Metabase / Superset) — questions, refresh, export",
    installHint: "docker pull metabase/metabase",
    installCmds: [],
  },
];

// ── config persistence ───────────────────────────────────────────────

const CONFIG_DIR = ".clawdata";
const CONFIG_FILE = "skills.json";

function configPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

function loadSavedSkills(projectRoot: string): string[] | null {
  try {
    const raw = fs.readFileSync(configPath(projectRoot), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.skills)) return data.skills as string[];
  } catch {
    // no config yet
  }
  return null;
}

function saveSkills(projectRoot: string, skillNames: string[]): void {
  const dir = path.join(projectRoot, CONFIG_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(projectRoot), JSON.stringify({ skills: skillNames }, null, 2) + "\n");
}

/**
 * Return the list of currently enabled skill names.
 * Other modules (e.g. doctor) can use this to decide which checks to run.
 */
export function getEnabledSkills(projectRoot: string): string[] {
  const saved = loadSavedSkills(projectRoot);
  if (saved) return saved;
  // first run — nothing saved yet, return skills whose binary is available
  return SKILLS.filter((s) => hasBin(s.bin, s.pythonImport)).map((s) => s.name);
}

// ── helpers ──────────────────────────────────────────────────────────

function hasBin(name: string, pythonImport?: boolean): boolean {
  if (pythonImport) {
    try {
      execSync(`python3 -c "import ${name}" 2>/dev/null`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    // Check well-known alternate paths for tools that install outside PATH
    return ALTERNATE_PATHS[name]?.some((p) => {
      const resolved = p.replace(/^~/, os.homedir());
      return fs.existsSync(resolved);
    }) ?? false;
  }
}

/** Tools that install to non-standard locations */
const ALTERNATE_PATHS: Record<string, string[]> = {
  snowsql: [
    "~/bin/snowsql",
    "/Applications/SnowSQL.app/Contents/MacOS/snowsql",
  ],
  great_expectations: [
    "~/.local/bin/great_expectations",
  ],
};

// ── alternate screen buffer ──────────────────────────────────────────

function enterAltScreen(): void {
  process.stdout.write("\x1B[?1049h"); // switch to alt buffer
  process.stdout.write("\x1B[H");      // move cursor to top-left
  process.stdout.write("\x1B[?25l");   // hide cursor
}

function leaveAltScreen(): void {
  process.stdout.write("\x1B[?25h");   // show cursor
  process.stdout.write("\x1B[?1049l"); // switch back to main buffer
}

// ── colours (works on most terminals) ────────────────────────────────

const DIM = "\x1B[2m";
const RESET = "\x1B[0m";
const BOLD = "\x1B[1m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const CYAN = "\x1B[36m";
const RED = "\x1B[31m";

// ── TUI state ────────────────────────────────────────────────────────

interface SkillRow {
  def: SkillDef;
  available: boolean;
  selected: boolean;
}

function buildRows(projectRoot: string): SkillRow[] {
  const saved = loadSavedSkills(projectRoot);
  return SKILLS.map((def) => {
    const available = hasBin(def.bin, def.pythonImport);
    // If we have saved config, use it. Otherwise pre-select if binary is available.
    const selected = saved ? saved.includes(def.name) : available;
    return { def, available, selected };
  });
}

// ── render ───────────────────────────────────────────────────────────

function render(rows: SkillRow[], cursor: number, message?: string): void {
  // Clear entire alt screen and rewrite from top
  process.stdout.write("\x1B[H\x1B[2J"); // cursor home + clear screen

  const lines: string[] = [];

  lines.push("");
  lines.push(`${BOLD}${CYAN}  OpenClaw — Add Skills${RESET}`);
  lines.push(`${DIM}  Use ↑/↓ to move, Space to toggle, Enter to confirm, q to quit${RESET}`);
  lines.push(`${DIM}  Press 'a' to select all${RESET}`);
  lines.push("");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pointer = i === cursor ? `${CYAN}❯${RESET}` : " ";
    const check = row.selected
      ? `${GREEN}◉${RESET}`
      : `${DIM}○${RESET}`;
    const status = row.available
      ? `${GREEN}ready${RESET}`
      : `${YELLOW}not installed${RESET}`;
    const name = i === cursor
      ? `${BOLD}${row.def.name}${RESET}`
      : row.def.name;

    lines.push(`  ${pointer} ${check}  ${name.padEnd(i === cursor ? row.def.name.length + 8 : 12)}  ${status}  ${DIM}${row.def.description}${RESET}`);
  }

  lines.push("");

  if (message) {
    lines.push(`  ${message}`);
    lines.push("");
  }

  // summary line
  const selectedNames = rows.filter((r) => r.selected).map((r) => r.def.name).join(", ");
  if (selectedNames) {
    lines.push(`  ${DIM}Selected: ${selectedNames}${RESET}`);
  } else {
    lines.push(`  ${DIM}No skills selected${RESET}`);
  }
  lines.push("");

  process.stdout.write(lines.join("\n"));
}

// ── install missing packages for selected skills ─────────────────────

function installSkillDeps(rows: SkillRow[]): string[] {
  const messages: string[] = [];
  const toInstall = rows.filter((r) => r.selected && !r.available && r.def.installCmds.length > 0);

  if (!toInstall.length) return messages;

  messages.push(`\n  ${BOLD}Installing dependencies for selected skills …${RESET}\n`);

  for (const row of toInstall) {
    for (const cmd of row.def.installCmds) {
      try {
        messages.push(`  ${DIM}$ ${cmd}${RESET}`);
        execSync(cmd, { stdio: "pipe" });
        messages.push(`  ${GREEN}✓${RESET}  ${row.def.name} — installed`);
        row.available = true;
      } catch (err: any) {
        messages.push(`  ${RED}✗${RESET}  ${row.def.name} — install failed: ${err.message?.split("\n")[0] ?? "unknown error"}`);
      }
    }
  }

  return messages;
}

// ── link skills ──────────────────────────────────────────────────────

function linkSkills(rows: SkillRow[], projectRoot: string): string[] {
  const selected = rows.filter((r) => r.selected);

  const openclawInstalled = hasBin("openclaw");
  if (!openclawInstalled) {
    return [`${YELLOW}⚠${RESET}  OpenClaw CLI not found. Skills saved locally — install openclaw to link globally.`];
  }

  let skillDir: string;
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    skillDir = path.join(npmRoot, "openclaw", "skills");
  } catch {
    return [`${RED}✗${RESET}  Could not determine global npm skill directory.`];
  }

  // ensure directory exists
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const messages: string[] = [];

  // clean up legacy names
  for (const old of ["duckdb-warehouse", "dbt-data-engineer"]) {
    const oldLink = path.join(skillDir, old);
    if (fs.existsSync(oldLink)) {
      fs.rmSync(oldLink, { recursive: true, force: true });
      messages.push(`${DIM}  cleaned up legacy: ${old}${RESET}`);
    }
  }

  // remove unselected skills first
  const unselected = rows.filter((r) => !r.selected);
  for (const row of unselected) {
    const link = path.join(skillDir, row.def.name);
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true, force: true });
      messages.push(`${DIM}  ${row.def.name} — unlinked${RESET}`);
    }
  }

  // link selected skills
  for (const row of selected) {
    const link = path.join(skillDir, row.def.name);
    const target = path.join(projectRoot, "skills", row.def.name);

    // remove stale
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true, force: true });
    }

    try {
      fs.symlinkSync(target, link);
      messages.push(`${GREEN}✓${RESET}  ${row.def.name} — linked`);
    } catch (err: any) {
      messages.push(`${RED}✗${RESET}  ${row.def.name} — ${err.message}`);
    }
  }

  // if airflow is selected, symlink DAGs; if not, clean up DAG symlinks
  if (selected.some((r) => r.def.name === "airflow") && hasBin("airflow")) {
    try {
      const airflowHome = process.env.AIRFLOW_HOME || path.join(os.homedir(), "airflow");
      const dagsDir = path.join(airflowHome, "dags");
      if (!fs.existsSync(dagsDir)) fs.mkdirSync(dagsDir, { recursive: true });
      const dagSrc = path.join(projectRoot, "apps", "airflow", "dags");
      if (fs.existsSync(dagSrc)) {
        for (const f of fs.readdirSync(dagSrc).filter((f) => f.endsWith(".py"))) {
          const dest = path.join(dagsDir, f);
          if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
          fs.symlinkSync(path.join(dagSrc, f), dest, "file");
        }
        messages.push(`${GREEN}✓${RESET}  Airflow DAGs symlinked to ${dagsDir}`);
      }
    } catch {
      // not critical — DAGs can be linked manually
    }
  } else {
    // clean up DAG symlinks if airflow was deselected
    try {
      const airflowHome = process.env.AIRFLOW_HOME || path.join(os.homedir(), "airflow");
      const dagsDir = path.join(airflowHome, "dags");
      const dagSrc = path.join(projectRoot, "apps", "airflow", "dags");
      if (fs.existsSync(dagSrc) && fs.existsSync(dagsDir)) {
        for (const f of fs.readdirSync(dagSrc).filter((f) => f.endsWith(".py"))) {
          const dest = path.join(dagsDir, f);
          if (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink()) {
            fs.rmSync(dest, { force: true });
          }
        }
      }
    } catch {
      // not critical
    }
  }

  // restart gateway
  try {
    execSync("openclaw gateway restart 2>/dev/null", { stdio: "ignore" });
    messages.push(`${GREEN}✓${RESET}  Gateway restarted`);
  } catch {
    // not critical
  }

  return messages;
}

// ── non-interactive mode (--yes flag) ────────────────────────────────

export function runNonInteractive(projectRoot: string): void {
  console.log(`\n${BOLD}${CYAN}  OpenClaw — Skills${RESET}\n`);

  const rows = buildRows(projectRoot);

  for (const row of rows) {
    const status = row.available
      ? `${GREEN}ready${RESET}`
      : `${YELLOW}not installed${RESET}  ${DIM}(${row.def.installHint})${RESET}`;
    const check = row.selected ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${check}  ${row.def.name.padEnd(12)}  ${status}  ${DIM}${row.def.description}${RESET}`);
  }

  console.log("");

  // install missing deps for selected skills
  const installMsgs = installSkillDeps(rows);
  installMsgs.forEach((m) => console.log(m));

  // save selections
  saveSkills(projectRoot, rows.filter((r) => r.selected).map((r) => r.def.name));

  const messages = linkSkills(rows, projectRoot);
  messages.forEach((m) => console.log(m));

  const linked = rows.filter((r) => r.selected).length;
  const skipped = rows.filter((r) => !r.selected).length;
  console.log(`\n  ${linked} skill(s) linked, ${skipped} skipped`);
  if (skipped > 0) {
    console.log(`  ${DIM}Install missing tools and run: clawdata skills${RESET}`);
  }
  console.log("");
}

// ── interactive TUI ──────────────────────────────────────────────────

export async function runInteractive(projectRoot: string): Promise<void> {
  // check terminal is a TTY
  if (!process.stdin.isTTY) {
    console.log("Not a TTY — falling back to non-interactive mode.");
    runNonInteractive(projectRoot);
    return;
  }

  const rows = buildRows(projectRoot);
  let cursor = 0;

  // enter alternate screen so we don't clobber prior output
  enterAltScreen();
  render(rows, cursor);

  // raw mode for keypresses
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve) => {
    const onKey = (_str: string, key: readline.Key) => {
      if (!key) return;

      // quit
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup();
        leaveAltScreen();
        console.log(`\n  ${DIM}Cancelled.${RESET}\n`);
        resolve();
        return;
      }

      // navigation
      if (key.name === "up" || key.name === "k") {
        cursor = (cursor - 1 + rows.length) % rows.length;
        render(rows, cursor);
        return;
      }
      if (key.name === "down" || key.name === "j") {
        cursor = (cursor + 1) % rows.length;
        render(rows, cursor);
        return;
      }

      // toggle
      if (key.name === "space") {
        rows[cursor].selected = !rows[cursor].selected;
        render(rows, cursor);
        return;
      }

      // select all / none
      if (key.name === "a") {
        const allSelected = rows.every((r) => r.selected);
        rows.forEach((r) => (r.selected = !allSelected));
        render(rows, cursor);
        return;
      }

      // confirm
      if (key.name === "return") {
        cleanup();
        leaveAltScreen();

        // always save selections (even if empty)
        const selectedNames = rows.filter((r) => r.selected).map((r) => r.def.name);
        saveSkills(projectRoot, selectedNames);

        const selected = rows.filter((r) => r.selected);
        if (!selected.length) {
          // still unlink everything from OpenClaw
          const unlinkMsgs = linkSkills(rows, projectRoot);
          unlinkMsgs.forEach((m) => console.log(m));
          console.log(`\n  ${YELLOW}No skills selected.${RESET} Run ${BOLD}clawdata skills${RESET} again to add skills.\n`);
          resolve();
          return;
        }

        // install missing deps for selected skills
        const installMsgs = installSkillDeps(rows);
        installMsgs.forEach((m) => console.log(m));

        // show linking results in the main buffer
        console.log(`\n${BOLD}${CYAN}  Linking skills …${RESET}\n`);
        const messages = linkSkills(rows, projectRoot);
        messages.forEach((m) => console.log(m));

        const linked = selected.length;
        console.log(`\n  ${GREEN}${linked} skill(s) linked.${RESET}`);

        // show install hints for skills that still couldn't be installed
        const missing = selected.filter((r) => !r.available);
        if (missing.length) {
          console.log(`\n  ${YELLOW}Note:${RESET} Some selected skills could not be auto-installed:`);
          missing.forEach((r) => {
            console.log(`    ${r.def.name}: ${DIM}${r.def.installHint}${RESET}`);
          });
        }

        console.log("");
        resolve();
        return;
      }
    };

    function cleanup(): void {
      process.stdin.removeListener("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on("keypress", onKey);
  });
}
