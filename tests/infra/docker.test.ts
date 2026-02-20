import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";

const ROOT = path.resolve(".");

describe("Docker configuration", () => {
  describe("Dockerfile", () => {
    it("should exist", async () => {
      const exists = await fs
        .access(path.join(ROOT, "Dockerfile"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should use node:22-slim as base", async () => {
      const content = await fs.readFile(path.join(ROOT, "Dockerfile"), "utf-8");
      expect(content).toContain("FROM node:22-slim");
    });

    it("should install Python and dbt", async () => {
      const content = await fs.readFile(path.join(ROOT, "Dockerfile"), "utf-8");
      expect(content).toContain("python3");
      expect(content).toContain("dbt-core");
      expect(content).toContain("dbt-duckdb");
    });

    it("should run npm ci and npm run build", async () => {
      const content = await fs.readFile(path.join(ROOT, "Dockerfile"), "utf-8");
      expect(content).toContain("npm ci");
      expect(content).toContain("npm run build");
    });

    it("should set correct env vars", async () => {
      const content = await fs.readFile(path.join(ROOT, "Dockerfile"), "utf-8");
      expect(content).toContain("ENV DB_PATH=");
      expect(content).toContain("ENV DATA_FOLDER=");
      expect(content).toContain("ENV DBT_PROJECT_DIR=");
    });

    it("should set clawdata as entrypoint", async () => {
      const content = await fs.readFile(path.join(ROOT, "Dockerfile"), "utf-8");
      expect(content).toContain('ENTRYPOINT ["clawdata"]');
    });
  });

  describe("docker-compose.yml", () => {
    it("should exist", async () => {
      const exists = await fs
        .access(path.join(ROOT, "docker-compose.yml"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should define clawdata service", async () => {
      const content = await fs.readFile(
        path.join(ROOT, "docker-compose.yml"),
        "utf-8"
      );
      expect(content).toContain("clawdata:");
    });

    it("should define pipeline service", async () => {
      const content = await fs.readFile(
        path.join(ROOT, "docker-compose.yml"),
        "utf-8"
      );
      expect(content).toContain("pipeline:");
    });

    it("should mount data volume", async () => {
      const content = await fs.readFile(
        path.join(ROOT, "docker-compose.yml"),
        "utf-8"
      );
      expect(content).toContain("./data:/app/data");
    });
  });

  describe(".dockerignore", () => {
    it("should exist", async () => {
      const exists = await fs
        .access(path.join(ROOT, ".dockerignore"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should exclude node_modules and build", async () => {
      const content = await fs.readFile(
        path.join(ROOT, ".dockerignore"),
        "utf-8"
      );
      expect(content).toContain("node_modules");
      expect(content).toContain("build");
    });
  });
});
