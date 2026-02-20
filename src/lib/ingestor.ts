import * as fs from "fs/promises";
import * as path from "path";
import { DatabaseManager } from "./database.js";
import { TaskTracker } from "./tasks.js";

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
          f.endsWith(".jsonl")
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
}
