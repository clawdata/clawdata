import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import {
  buildRoutes,
  matchRoute,
  createServer,
  ServeOptions,
  RouteHandler,
} from "../../src/commands/serve.js";

/* ──── Fake DB manager for testing ──── */
const fakeDb: ServeOptions["dbManager"] = {
  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes("ERROR")) throw new Error("query error");
    return [{ result: 1 }] as unknown as T[];
  },
  async getInfo() {
    return { type: "duckdb", tables: 2, tableList: [{ table_name: "foo" }, { table_name: "bar" }] };
  },
  async sampleTable(name: string, limit?: number) {
    if (name === "missing") throw new Error("Table not found");
    return [{ id: 1, name: "alice" }];
  },
};

function fetch(url: string, opts?: { method?: string; body?: string }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: opts?.method || "GET", headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          resolve({ status: res.statusCode!, body: JSON.parse(text) });
        });
      }
    );
    req.on("error", reject);
    if (opts?.body) req.write(opts.body);
    req.end();
  });
}

/* ──── Route matching (unit) ──── */
describe("matchRoute", () => {
  const routes = buildRoutes({ port: 0, host: "127.0.0.1", dbManager: fakeDb });

  it("matches GET /health", () => {
    const m = matchRoute(routes, "GET", "/health");
    expect(m).not.toBeNull();
  });

  it("matches GET /api/tables", () => {
    const m = matchRoute(routes, "GET", "/api/tables");
    expect(m).not.toBeNull();
  });

  it("matches GET /api/table/:name", () => {
    const m = matchRoute(routes, "GET", "/api/table/my_table");
    expect(m).not.toBeNull();
    expect(m!.match[1]).toBe("my_table");
  });

  it("matches POST /api/query", () => {
    const m = matchRoute(routes, "POST", "/api/query");
    expect(m).not.toBeNull();
  });

  it("returns null for unknown routes", () => {
    expect(matchRoute(routes, "GET", "/nope")).toBeNull();
  });

  it("returns null for wrong method", () => {
    expect(matchRoute(routes, "POST", "/health")).toBeNull();
  });
});

/* ──── Integration test with HTTP server ──── */
describe("HTTP server", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer({ port: 0, host: "127.0.0.1", dbManager: fakeDb });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /health returns ok", async () => {
    const { status, body } = await fetch(`${baseUrl}/health`);
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTruthy();
  });

  it("GET /api/info returns database info", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/info`);
    expect(status).toBe(200);
    expect(body.type).toBe("duckdb");
    expect(body.tables).toBe(2);
  });

  it("GET /api/tables lists tables", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/tables`);
    expect(status).toBe(200);
    expect(body.tables).toHaveLength(2);
  });

  it("GET /api/table/:name samples rows", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/table/foo`);
    expect(status).toBe(200);
    expect(body.table).toBe("foo");
    expect(body.rows).toHaveLength(1);
  });

  it("GET /api/table/:name returns 400 for missing table", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/table/missing`);
    expect(status).toBe(400);
    expect(body.error).toContain("Table not found");
  });

  it("POST /api/query executes SQL", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT 1" }),
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rowCount).toBe(1);
  });

  it("POST /api/query returns 400 when sql missing", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Missing");
  });

  it("POST /api/query returns 400 on query error", async () => {
    const { status, body } = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      body: JSON.stringify({ sql: "SELECT ERROR" }),
    });
    expect(status).toBe(400);
    expect(body.error).toContain("query error");
  });

  it("returns 404 for unknown route", async () => {
    const { status, body } = await fetch(`${baseUrl}/unknown`);
    expect(status).toBe(404);
    expect(body.error).toBe("Not Found");
  });

  it("includes CORS headers", async () => {
    // Check by looking at response headers
    await new Promise<void>((resolve, reject) => {
      const u = new URL(`${baseUrl}/health`);
      const req = http.request(
        { hostname: u.hostname, port: u.port, path: "/health", method: "GET" },
        (res) => {
          expect(res.headers["access-control-allow-origin"]).toBe("*");
          res.resume();
          res.on("end", resolve);
        }
      );
      req.on("error", reject);
      req.end();
    });
  });
});
