import { Room, TICK_RATE, type ClientMsg, type ServerMsg } from "@neon/sim";

const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
const STEP_MS = 1000 / TICK_RATE;

export interface Client {
  send(data: string): void;
}

interface Entry {
  room: Room;
  clients: Map<string, Client>;
  timer: ReturnType<typeof setInterval>;
}

export class Lobby {
  private rooms = new Map<string, Entry>();

  create(): string {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
    while (this.rooms.has(code));

    const clients = new Map<string, Client>();
    const io = {
      send: (id: string, msg: ServerMsg) => clients.get(id)?.send(JSON.stringify(msg)),
      broadcast: (msg: ServerMsg) => {
        const data = JSON.stringify(msg);
        for (const c of clients.values()) c.send(data);
      },
    };
    const room = new Room(code, io);
    let last = performance.now();
    let acc = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + now - last, STEP_MS * 10);
      last = now;
      while (acc >= STEP_MS) {
        room.update(1 / TICK_RATE);
        acc -= STEP_MS;
      }
    }, 4);
    this.rooms.set(code, { room, clients, timer });
    return code;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  join(code: string, id: string, name: string, client: Client): string | null {
    const entry = this.rooms.get(code);
    if (!entry) return "Room not found";
    entry.clients.set(id, client);
    if (!entry.room.join(id, name)) {
      entry.clients.delete(id);
      return "Room is full";
    }
    return null;
  }

  message(code: string, id: string, raw: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg && typeof msg === "object" && typeof msg.t === "string") entry.room.handle(id, msg);
  }

  leave(code: string, id: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.clients.delete(id);
    entry.room.leave(id);
    if (entry.room.size === 0) {
      clearInterval(entry.timer);
      this.rooms.delete(code);
    }
  }
}
