import type { ClientMsg, ServerMsg } from "@neon/sim";

export interface Connection {
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): void;
  onClose(cb: (e: CloseEvent) => void): void;
  close(): void;
}

export function connect(room: string, name: string): Connection {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);
  const queue: string[] = [];
  let closedByUs = false;
  ws.onopen = () => queue.splice(0).forEach((m) => ws.send(m));
  return {
    send(msg) {
      const data = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else if (ws.readyState === WebSocket.CONNECTING) queue.push(data);
    },
    onMessage(cb) {
      ws.addEventListener("message", (e) => cb(JSON.parse(String(e.data))));
    },
    onClose(cb) {
      ws.addEventListener("close", (e) => !closedByUs && cb(e));
    },
    close() {
      closedByUs = true;
      ws.close();
    },
  };
}
