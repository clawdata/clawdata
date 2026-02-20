/**
 * `clawdata update` — check for and install CLI updates.
 *
 * Checks the npm registry for the latest version, compares with the current
 * version, and optionally runs `npm install` to upgrade.
 *
 * Usage:
 *   clawdata update           Check for updates and install if available
 *   clawdata update --check   Check only, don't install
 */

import { execSync } from "child_process";
import { jsonMode, output } from "../lib/output.js";

const PACKAGE_NAME = "clawdata";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
}

/**
 * Fetch the latest published version from the npm registry.
 */
export function fetchLatestVersion(packageName: string = PACKAGE_NAME): string | null {
  try {
    const result = execSync(`npm view ${packageName} version 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Check whether an update is available.
 */
export function checkForUpdate(
  currentVersion: string,
  packageName?: string
): UpdateCheckResult {
  const latestVersion = fetchLatestVersion(packageName);
  if (!latestVersion) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      error: "Could not reach the npm registry",
    };
  }
  const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
  return { currentVersion, latestVersion, updateAvailable };
}

/**
 * Install the latest version globally.
 */
export function installUpdate(packageName: string = PACKAGE_NAME): { success: boolean; output: string } {
  try {
    const out = execSync(`npm install -g ${packageName}@latest 2>&1`, {
      encoding: "utf-8",
      timeout: 60000,
    });
    return { success: true, output: out.trim() };
  } catch (err) {
    return {
      success: false,
      output: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function updateCommand(
  sub: string | undefined,
  _rest: string[],
  currentVersion: string
): Promise<void> {
  const checkOnly = sub === "--check" || sub === "check";

  if (!jsonMode) {
    console.log(`Current version: ${currentVersion}`);
    console.log("Checking for updates…");
  }

  const result = checkForUpdate(currentVersion);

  if (result.error) {
    if (jsonMode) {
      output(result);
    } else {
      console.log(`⚠ ${result.error}`);
    }
    return;
  }

  if (!result.updateAvailable) {
    if (jsonMode) {
      output(result);
    } else {
      console.log(`✓ Already up to date (${currentVersion})`);
    }
    return;
  }

  if (jsonMode) {
    if (checkOnly) {
      output(result);
      return;
    }
    const install = installUpdate();
    output({ ...result, installed: install.success });
    return;
  }

  console.log(`Update available: ${currentVersion} → ${result.latestVersion}`);

  if (checkOnly) {
    console.log(`Run "clawdata update" to install.`);
    return;
  }

  console.log("Installing…");
  const install = installUpdate();
  if (install.success) {
    console.log(`✓ Updated to ${result.latestVersion}`);
  } else {
    console.log(`✗ Update failed: ${install.output}`);
  }
}
