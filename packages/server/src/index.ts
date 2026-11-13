import { join, normalize } from "node:path";
import { Lobby } from "./lobby";
import { log, logError, rateLimiter } from "./log";

const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR ?? join(import.meta.dir, "../../client/dist");
const serveStatic = process.env.NODE_ENV === "production";
const lobby = new Lobby();
const clientReportAllowed = rateLimiter(30);
const MAX_REPORT_BYTES = 16_000;
const STATS_MS = 60_000;

interface SocketData {
  id: string;
  code: string;
  name: string;
  ua: string;
}

const server = Bun.serve<SocketData>({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const requested = (url.searchParams.get("room") ?? "").toUpperCase();
      const code = requested === "NEW" ? lobby.create() : requested;
      const data = { id: crypto.randomUUID().slice(0, 8), code, name: url.searchParams.get("name") ?? "", ua: req.headers.get("user-agent") ?? "" };
      if (server.upgrade(req, { data })) return undefined;
      log("ws.upgrade_failed", { room: code, name: data.name });
      return new Response("Upgrade failed", { status: 400 });
    }
    if (url.pathname === "/log" && req.method === "POST") return clientReport(req, server.requestIP(req)?.address);
    if (!serveStatic) return new Response("neon-racer server");
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = Bun.file(join(staticDir, path));
    return (await file.exists()) ? new Response(file) : new Response(Bun.file(join(staticDir, "index.html")));
  },
  websocket: {
    open(ws) {
      const error = lobby.join(ws.data.code, ws.data.id, ws.data.name, ws);
      if (error) {
        log("player.join_refused", { room: ws.data.code, name: ws.data.name, error, ua: ws.data.ua });
        ws.send(JSON.stringify({ t: "error", message: error }));
        ws.close();
      }
    },
    message(ws, message) {
      lobby.message(ws.data.code, ws.data.id, String(message));
    },
    close(ws, code, reason) {
      lobby.leave(ws.data.code, ws.data.id, code, reason);
    },
  },
});

console.log(`server on :${server.port}${serveStatic ? " (serving client)" : ""}`);
log("server.started", { port: server.port, bun: Bun.version, machine: process.env.FLY_MACHINE_ID, version: process.env.FLY_MACHINE_VERSION, image: process.env.FLY_IMAGE_REF });

setInterval(() => lobby.logStats(), STATS_MS);

// Keep the process up so one bad room can't end every other race, but make the failure loud.
process.on("uncaughtException", (err) => logError("server.uncaught_exception", err));
process.on("unhandledRejection", (err) => logError("server.unhandled_rejection", err));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("server.stopping", { signal, rooms: lobby.size });
    process.exit(0);
  });
}

// Browsers post their own errors, disconnects and frame rates here, so they show up in `fly logs` beside the room.
async function clientReport(req: Request, ip: string | undefined): Promise<Response> {
  const key = req.headers.get("fly-client-ip") ?? ip ?? "?";
  const body = await req.text();
  if (body.length > MAX_REPORT_BYTES || !clientReportAllowed(key)) return new Response(null, { status: 204 });
  try {
    const { kind, ...fields } = JSON.parse(body) as Record<string, unknown>;
    const { stack, ...rest } = fields;
    log(`client.${typeof kind === "string" ? kind.replace(/[^\w.]/g, "") : "unknown"}`, rest);
    if (typeof stack === "string") console.log(stack.split("\n").slice(0, 15).map((l) => `  ${l}`).join("\n"));
  } catch {
    log("client.bad_report", { body: body.slice(0, 200) });
  }
  return new Response(null, { status: 204 });
}
