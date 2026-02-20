/**
 * `clawdata serve` — lightweight HTTP API mode.
 *
 * Exposes the CLI functionality as a REST API using Node.js built-in http module.
 *
 * Endpoints:
 *   GET  /health          Health check
 *   GET  /api/tables      List tables
 *   POST /api/query       { sql } → query result rows
 *   GET  /api/table/:name Sample rows from a table
 *   GET  /api/info        Database info
 *   POST /api/ingest      { file, table? } → ingest a file
 */

import * as http from "http";

export interface ServeOptions {
  port: number;
  host: string;
  dbManager: {
    query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
    getInfo(): Promise<unknown>;
    sampleTable(name: string, limit?: number): Promise<Record<string, unknown>[]>;
  };
}

export interface RouteHandler {
  method: "GET" | "POST";
  pattern: RegExp;
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    match: RegExpMatchArray,
    body?: string
  ) => Promise<void>;
}

/** Parse request body as string. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Send JSON response. */
function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** Build the route table. */
export function buildRoutes(opts: ServeOptions): RouteHandler[] {
  const { dbManager } = opts;

  return [
    {
      method: "GET",
      pattern: /^\/health$/,
      handler: async (_req, res) => {
        json(res, { status: "ok", timestamp: new Date().toISOString() });
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/info$/,
      handler: async (_req, res) => {
        const info = await dbManager.getInfo();
        json(res, info);
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/tables$/,
      handler: async (_req, res) => {
        const info = (await dbManager.getInfo()) as { tableList: unknown[] };
        json(res, { tables: info.tableList });
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/table\/([a-zA-Z0-9_]+)$/,
      handler: async (_req, res, match) => {
        const tableName = match[1];
        try {
          const rows = await dbManager.sampleTable(tableName, 100);
          json(res, { table: tableName, rows, rowCount: rows.length });
        } catch (err: any) {
          json(res, { error: err.message }, 400);
        }
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/query$/,
      handler: async (_req, res, _match, body) => {
        try {
          const { sql } = JSON.parse(body || "{}");
          if (!sql) {
            json(res, { error: "Missing 'sql' in request body" }, 400);
            return;
          }
          const rows = await dbManager.query(sql);
          json(res, { rows, rowCount: rows.length });
        } catch (err: any) {
          json(res, { error: err.message }, 400);
        }
      },
    },
  ];
}

/**
 * Match an incoming request to a route handler.
 */
export function matchRoute(
  routes: RouteHandler[],
  method: string,
  url: string
): { handler: RouteHandler; match: RegExpMatchArray } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = url.match(route.pattern);
    if (m) return { handler: route, match: m };
  }
  return null;
}

/**
 * Create (but don't start) the HTTP server.
 */
export function createServer(opts: ServeOptions): http.Server {
  const routes = buildRoutes(opts);

  const server = http.createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    const method = (req.method || "GET").toUpperCase();

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const matched = matchRoute(routes, method, url);
    if (!matched) {
      json(res, { error: "Not Found", path: url }, 404);
      return;
    }

    try {
      const body = method === "POST" ? await readBody(req) : undefined;
      await matched.handler.handler(req, res, matched.match, body);
    } catch (err: any) {
      json(res, { error: err.message || "Internal Server Error" }, 500);
    }
  });

  return server;
}

/**
 * CLI entry point: start the server and listen.
 */
export async function serveCommand(
  rest: string[],
  dbManager: ServeOptions["dbManager"]
): Promise<void> {
  const portFlag = rest.indexOf("--port");
  const port = portFlag !== -1 ? parseInt(rest[portFlag + 1], 10) || 3000 : 3000;

  const hostFlag = rest.indexOf("--host");
  const host = hostFlag !== -1 ? rest[hostFlag + 1] || "127.0.0.1" : "127.0.0.1";

  const server = createServer({ port, host, dbManager });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.log(`ClawData API server listening on http://${host}:${port}`);
      console.log("");
      console.log("Endpoints:");
      console.log("  GET  /health             Health check");
      console.log("  GET  /api/info           Database info");
      console.log("  GET  /api/tables         List tables");
      console.log("  GET  /api/table/:name    Sample rows");
      console.log("  POST /api/query          Execute SQL { sql: \"...\" }");
      console.log("");
      console.log("Press Ctrl+C to stop.");
      resolve();
    });
  });
}
