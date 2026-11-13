// One line per event in logfmt (`event key=value ...`), so `fly logs | grep room=ABCD` follows a single room.
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log([event, ...Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${format(v)}`)].join(" "));
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  log(event, { ...fields, error: e.message });
  if (e.stack) console.log(e.stack.split("\n").map((l) => `  ${l}`).join("\n"));
}

// Allows `limit` calls per key each minute, so a broken client or a crashing tick can't flood the logs.
export function rateLimiter(limit: number) {
  let windowStart = Date.now();
  const counts = new Map<string, number>();
  return (key: string): boolean => {
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      counts.clear();
    }
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n <= limit;
  };
}

function format(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /^[\w.:/@+-]*$/.test(s) && s !== "" ? s : JSON.stringify(s.length > 2000 ? `${s.slice(0, 2000)}…` : s);
}
