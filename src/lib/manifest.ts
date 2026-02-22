/**
 * Tracks which files have been ingested and their checksums/timestamps.
 * Used for incremental ingestion — skip files that haven't changed.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export interface IngestRecord {
  file: string;
  table: string;
  checksum: string;
  size: number;
  modifiedAt: string;
  ingestedAt: string;
}

export class IngestManifest {
  private records = new Map<string, IngestRecord>();
  private manifestPath: string;

  constructor(rootDir: string) {
    this.manifestPath = path.join(rootDir, "userdata", "config", "ingest-manifest.json");
  }

  /** Load manifest from disk. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.manifestPath, "utf-8");
      const data: IngestRecord[] = JSON.parse(raw);
      for (const r of data) {
        this.records.set(r.file, r);
      }
    } catch {
      // File doesn't exist — start fresh
    }
  }

  /** Save manifest to disk. */
  async save(): Promise<void> {
    const dir = path.dirname(this.manifestPath);
    await fs.mkdir(dir, { recursive: true });
    const data = Array.from(this.records.values());
    await fs.writeFile(this.manifestPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /** Compute SHA-256 checksum of a file. */
  static async checksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /** Check if a file needs re-ingestion. */
  async needsIngest(filePath: string): Promise<boolean> {
    const resolved = path.resolve(filePath);
    const existing = this.records.get(resolved);
    if (!existing) return true;

    try {
      const stat = await fs.stat(resolved);
      // Quick check: size or mtime changed
      if (stat.size !== existing.size) return true;
      if (stat.mtime.toISOString() !== existing.modifiedAt) {
        // Size matches but mtime differs — compare checksum
        const hash = await IngestManifest.checksum(resolved);
        return hash !== existing.checksum;
      }
      return false;
    } catch {
      return true; // File unreadable — re-ingest
    }
  }

  /** Record a successful ingestion. */
  async record(filePath: string, tableName: string): Promise<void> {
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);
    const checksum = await IngestManifest.checksum(resolved);
    this.records.set(resolved, {
      file: resolved,
      table: tableName,
      checksum,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      ingestedAt: new Date().toISOString(),
    });
  }

  /** Get the record for a file, or undefined. */
  get(filePath: string): IngestRecord | undefined {
    return this.records.get(path.resolve(filePath));
  }

  /** Get all records. */
  all(): IngestRecord[] {
    return Array.from(this.records.values());
  }

  /** Clear all records. */
  clear(): void {
    this.records.clear();
  }
}
