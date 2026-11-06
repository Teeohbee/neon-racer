import { join, normalize } from "node:path";
import { Lobby } from "./lobby";

const port = Number(process.env.PORT ?? 8787);
const staticDir = join(import.meta.dir, "../../client/dist");
const serveStatic = process.env.NODE_ENV === "production";
const lobby = new Lobby();

interface SocketData {
  id: string;
  code: string;
  name: string;
}

const server = Bun.serve<SocketData>({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const requested = (url.searchParams.get("room") ?? "").toUpperCase();
      const code = requested === "NEW" ? lobby.create() : requested;
      const data = { id: crypto.randomUUID().slice(0, 8), code, name: url.searchParams.get("name") ?? "" };
      return server.upgrade(req, { data }) ? undefined : new Response("Upgrade failed", { status: 400 });
    }
    if (!serveStatic) return new Response("neon-racer server");
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = Bun.file(join(staticDir, path));
    return (await file.exists()) ? new Response(file) : new Response(Bun.file(join(staticDir, "index.html")));
  },
  websocket: {
    open(ws) {
      const error = lobby.join(ws.data.code, ws.data.id, ws.data.name, ws);
      if (error) {
        ws.send(JSON.stringify({ t: "error", message: error }));
        ws.close();
      }
    },
    message(ws, message) {
      lobby.message(ws.data.code, ws.data.id, String(message));
    },
    close(ws) {
      lobby.leave(ws.data.code, ws.data.id);
    },
  },
});

console.log(`server on :${server.port}${serveStatic ? " (serving client)" : ""}`);
