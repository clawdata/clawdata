/**
 * Skill health scanner.
 *
 * Uses `openclaw skills list --json` to get real skill status from the Gateway,
 * then cross-references with the project's local skills/ directory.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";

export interface SkillHealth {
  name: string;
  installed: boolean;    // exists in project skills/ dir
  linked: boolean;       // recognised by openclaw (bundled or workspace)
  available: boolean;    // eligible (all prerequisites met)
  description?: string;
  tags?: string[];
  source?: string;       // "openclaw-bundled" | "workspace" | "project"
  emoji?: string;
}

interface OpenClawSkill {
  name: string;
  description?: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  missing?: { bins: string[]; anyBins: string[]; env: string[]; config: string[]; os: string[] };
}

export class SkillScanner {
  private cache: SkillHealth[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30_000; // 30 seconds

  constructor(private root: string) {}

  /**
   * Scan all skills and return health status.
   */
  async scan(): Promise<SkillHealth[]> {
    // Return cached result if fresh
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

    // 1. Get project-local skills (skills/ directory)
    const projectSkillNames = new Set<string>();
    const projectTags = new Map<string, string[]>();
    const skillsDir = path.join(this.root, "skills");
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        projectSkillNames.add(entry.name);

        // Try to parse tags from SKILL.md frontmatter
        try {
          const content = await fs.readFile(
            path.join(skillsDir, entry.name, "SKILL.md"),
            "utf-8"
          );
          const tagsMatch = content.match(/tags:\s*\[([^\]]+)\]/);
          if (tagsMatch) {
            projectTags.set(
              entry.name,
              tagsMatch[1].split(",").map((t) => t.trim())
            );
          }
        } catch {
          // No SKILL.md or parse error
        }
      }
    } catch {
      // skills/ dir doesn't exist
    }

    // 2. Get OpenClaw's authoritative skill list
    const openclawSkills = await this.fetchOpenClawSkills();
    const openclawMap = new Map<string, OpenClawSkill>();
    for (const s of openclawSkills) openclawMap.set(s.name, s);

    // 3. Merge: project skills enriched with OpenClaw status
    const skills: SkillHealth[] = [];
    const seen = new Set<string>();

    // Project skills first (these are what matter to the user)
    for (const name of projectSkillNames) {
      seen.add(name);
      const oc = openclawMap.get(name);
      skills.push({
        name,
        installed: true,
        linked: !!oc,
        available: oc?.eligible ?? false,
        description: oc?.description?.trim() || "",
        tags: projectTags.get(name) || [],
        source: oc ? oc.source : "project",
        emoji: oc?.emoji,
      });
    }

    // OpenClaw bundled skills that overlap with project skills are already handled.
    // Don't add all 65+ bundled skills — only show project-relevant ones.

    this.cache = skills;
    this.cacheTime = Date.now();
    return skills;
  }

  /**
   * Fetch skills from `openclaw skills list --json`.
   */
  private fetchOpenClawSkills(): Promise<OpenClawSkill[]> {
    return new Promise((resolve) => {
      execFile(
        "openclaw",
        ["skills", "list", "--json"],
        { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return resolve([]);
          try {
            const data = JSON.parse(stdout);
            resolve(data.skills || []);
          } catch {
            resolve([]);
          }
        }
      );
    });
  }
}
