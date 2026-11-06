# neon-racer

Top-down party racer for team game time. Players take turns sketching the track, the camera follows the leader, and anyone who falls off screen is out. Eliminated players drop hazards on the ones still racing.

## Run

```sh
bun install
bun run dev        # server on :8787, client on http://localhost:5173
```

Open the client, create a room and share the invite link. To play with people outside your network before hosting is decided, tunnel the Vite port (for example `cloudflared tunnel --url http://localhost:5173`).

Production-style single process:

```sh
bun run build && bun run start   # serves client and rooms on :8787
```

## Check

```sh
bun run test
bun run check
```

## Layout

| Package | Owns |
|---------|------|
| `packages/sim` | All game rules: car physics, tracks, validation, hazards, camera, collisions, the `Room` state machine and protocol. No platform imports. |
| `packages/server` | Thin bun WebSocket adapter around `Room`, room codes, static serving. |
| `packages/client` | PixiJS renderer, practice mode, online play, interpolation and prediction. |

Hosting is undecided; a new platform only needs another adapter like `packages/server/src/lobby.ts`.

## Controls

| Action | Keys |
|--------|------|
| Drive | WASD / arrows |
| Handbrake | Shift |
| Sketch | Drag a loop, or click, move, click. Enter to submit, C to clear |
| Hazards (when out) | 1 Block, 2 Slow, 3 Freeze, click to place |
| Practice | R reset, T draw, N random track, ` tuning panel |
