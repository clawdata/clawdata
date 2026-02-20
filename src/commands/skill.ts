/**
 * `clawdata skill` subcommands — create, list.
 *
 * Scaffolds a new skill folder with a SKILL.md template.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { jsonMode, output } from "../lib/output.js";

function skillMdTemplate(name: string): string {
  return `# ${name} Skill

## Overview
<!-- Describe what this skill does and when to use it. -->

## Prerequisites
- <!-- Tool or service required -->

## Commands
| Command | Description |
|---------|-------------|
| \`clawdata ${name.toLowerCase()} <subcommand>\` | <!-- description --> |

## Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| \`${name.toUpperCase()}_HOST\` | Service host | \`localhost\` |

## Examples
\`\`\`bash
clawdata ${name.toLowerCase()} status
\`\`\`
`;
}

export async function skillCommand(
  sub: string | undefined,
  rest: string[]
): Promise<void> {
  switch (sub) {
    case "create": {
      const name = rest[0];
      if (!name) {
        console.error("Usage: clawdata skill create <name>");
        process.exit(1);
      }

      const skillDir = path.resolve("skills", name.toLowerCase());
      const skillMd = path.join(skillDir, "SKILL.md");

      await fs.mkdir(skillDir, { recursive: true });

      // Don't overwrite existing SKILL.md
      try {
        await fs.access(skillMd);
        if (jsonMode) {
          output({ created: false, path: skillDir, reason: "already exists" });
        } else {
          console.log(`Skill already exists: ${skillDir}`);
        }
        return;
      } catch {
        // File doesn't exist — create it
      }

      await fs.writeFile(skillMd, skillMdTemplate(name), "utf-8");

      if (jsonMode) {
        output({ created: true, path: skillDir, files: ["SKILL.md"] });
      } else {
        console.log(`✓ Created skill: ${skillDir}`);
        console.log("  + SKILL.md");
        console.log(`\nEdit skills/${name.toLowerCase()}/SKILL.md to document your skill.`);
      }
      return;
    }

    case "list": {
      const skillsDir = path.resolve("skills");
      try {
        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        const skills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        if (jsonMode) {
          output({ skills, count: skills.length });
        } else if (!skills.length) {
          console.log("No skills found. Create one with: clawdata skill create <name>");
        } else {
          console.log("Available skills:");
          skills.forEach((s) => console.log(`  • ${s}`));
        }
      } catch {
        console.log("No skills directory found.");
      }
      return;
    }

    default:
      if (sub && sub !== "help" && sub !== "--help") {
        console.error(`Unknown skill command: ${sub}\n`);
      }
      console.log("Usage: clawdata skill <command>\n");
      console.log("Commands:");
      console.log("  create <name>    Scaffold a new skill folder with SKILL.md");
      console.log("  list             List available skills");
      if (sub && sub !== "help" && sub !== "--help") process.exit(1);
      return;
  }
}
