import * as fs from "fs/promises";
import * as path from "path";
import { DatabaseManager } from "./database.js";
import { TaskTracker } from "./tasks.js";
import { glob } from "./glob.js";

export class DataIngestor {
  private dataFolder: string;

  constructor(
    private dbManager: DatabaseManager,
    private taskTracker: TaskTracker
  ) {
    this.dataFolder = process.env.DATA_FOLDER || "./data/sample";
  }

  async listFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataFolder);
      return files.filter(
        (f) =>
          f.endsWith(".csv") ||
          f.endsWith(".json") ||
          f.endsWith(".parquet") ||
          f.endsWith(".jsonl") ||
          f.endsWith(".xlsx") ||
          f.endsWith(".xls")
      );
    } catch {
      return [];
    }
  }

  async ingestFile(fileName: string, tableName?: string): Promise<string> {
    const taskId = this.taskTracker.createTask(`Ingest ${fileName}`);

    try {
      this.taskTracker.startTask(taskId, `Loading file: ${fileName}`);

      const filePath = path.join(this.dataFolder, fileName);
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) throw new Error(`${fileName} is not a file`);

      const table = tableName || path.parse(fileName).name.replace(/[^a-zA-Z0-9_]/g, "_");
      const ext = path.extname(fileName).toLowerCase();

      this.taskTracker.updateTask(taskId, 50, `Loading into table: ${table}`);

      if (ext === ".csv") {
        await this.dbManager.loadCSV(table, filePath);
      } else if (ext === ".parquet") {
        await this.dbManager.loadParquet(table, filePath);
      } else if (ext === ".json" || ext === ".jsonl") {
        await this.dbManager.loadJSON(table, filePath);
      } else if (ext === ".xlsx" || ext === ".xls") {
        await this.dbManager.loadExcel(table, filePath);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      this.taskTracker.completeTask(taskId, `Successfully loaded ${fileName} into table ${table}`);
      return `Successfully loaded ${fileName} into table ${table}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.taskTracker.failTask(taskId, errorMsg);
      throw error;
    }
  }

  async ingestAll(): Promise<string> {
    const files = await this.listFiles();
    const results: string[] = [];
    for (const file of files) {
      try {
        results.push(await this.ingestFile(file));
      } catch (error) {
        results.push(`Failed to load ${file}: ${error}`);
      }
    }
    return results.join("\n");
  }

  /**
   * Ingest a file from a remote URL (http://, https://, s3://).
   * Table name is derived from the URL filename or can be supplied.
   */
  async ingestURL(url: string, tableName?: string): Promise<string> {
    const taskId = this.taskTracker.createTask(`Ingest URL ${url}`);
    try {
      this.taskTracker.startTask(taskId, `Downloading: ${url}`);
      // Derive table name from URL path
      const urlPath = new URL(url).pathname;
      const baseName = path.basename(urlPath);
      const table = tableName || path.parse(baseName || "remote_data").name.replace(/[^a-zA-Z0-9_]/g, "_");

      this.taskTracker.updateTask(taskId, 30, `Loading into table: ${table}`);
      await this.dbManager.loadURL(table, url);
      this.taskTracker.completeTask(taskId, `Successfully loaded ${url} into table ${table}`);
      return `Successfully loaded ${url} into table ${table}`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.taskTracker.failTask(taskId, errorMsg);
      throw error;
    }
  }

  /** Check if a string looks like a URL. */
  static isURL(input: string): boolean {
    return /^https?:\/\//.test(input) || input.startsWith("s3://");
  }

  /**
   * Preview inferred schema for a file without loading it.
   * Returns column names and detected types.
   */
  async previewSchema(fileName: string): Promise<{ column_name: string; data_type: string }[]> {
    const filePath = path.join(this.dataFolder, fileName);
    return this.dbManager.inferSchema(filePath);
  }

  /**
   * Ingest files matching a glob pattern.
   * Patterns are resolved relative to DATA_FOLDER.
   * Examples: "logs/*.json", "**\/*.csv", "orders_202?.csv"
   */
  async ingestGlob(pattern: string): Promise<string> {
    const matches = await glob(pattern, this.dataFolder);
    if (!matches.length) return `No files match pattern: ${pattern}`;

    const results: string[] = [];
    for (const absPath of matches) {
      const fileName = path.relative(this.dataFolder, absPath);
      try {
        results.push(await this.ingestFile(fileName));
      } catch (error) {
        results.push(`Failed to load ${fileName}: ${error}`);
      }
    }
    return results.join("\n");
  }
}
