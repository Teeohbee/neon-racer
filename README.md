# neon-racer

High Rollers: a top-down party racer on hard-light lanes high above a neon city, for team game time. Each match runs on one of ten built-in tracks, and every round restarts behind where the last winner finished, in reverse finishing order: last place on pole, the winner at the back. An elimination line chases the pack a fixed distance behind the leader, and the camera keeps both in shot: anyone the line catches, or who falls off a drop, is out. Eliminated players drop hazards on the ones still racing. Track sketching is built but switched off (`sketching` room option, `SKETCHING` in practice).

## Run

```sh
bun install
bun run dev        # server on :8787, client on http://localhost:5173
```

Open the client, create a room and share the invite link, or pick Local play to race on one screen with a controller each (in development builds the keyboard can take a Seat too: Shift joins, Enter starts).

Production-style single process:

```sh
bun run build && bun run start   # serves client and rooms on :8787
```

## Deploy

Hosted on Fly.io as one machine in London (`fly.toml`), at https://neon-racer.fly.dev. Rooms live in memory, so it must stay a single machine. It stops when nobody is connected and starts again on the next visit.

```sh
fly deploy --local-only   # Fly's remote builder fails behind Netskope
```

Roll back with `fly releases` then `fly deploy --image <previous image>`.

## Steam build

The Steam Machine gets an Electron AppImage that runs Local play with no server ([ADR 0001](docs/adr/0001-steam-build-is-an-electron-appimage.md)). It lives in `desktop/`, outside the bun workspaces, so the Fly image never installs Electron.

```sh
cd desktop && bun install
bun run start   # try it on the Mac: fullscreen, quit from the title menu
bun run dist    # desktop/release/HighRollers.AppImage (Linux x64)
```

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds the AppImage and attaches it to that tag's release. [steam-tools](https://github.com/Teeohbee/steam-tools) installs it from there using `steam/game.conf` and `steam/art/`:

```sh
git tag v0.1.0 && git push origin v0.1.0
steam-install machine ~/Projects/neon-racer
```

The launcher downloads the release without signing in, so the repo has to be public.

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
| `packages/client` | PixiJS renderer, practice mode (hidden from the title menu), online play, interpolation and prediction, and Local play (`src/local/`), which runs a `Room` in the browser with a controller per Seat. |
| `desktop` | Electron wrapper for the Steam build. Not a workspace. |

## Controls

| Action | Keys |
|--------|------|
| Drive | WASD / arrows |
| Handbrake | Shift |
| Hazards (when out) | 1 Block, 2 Slow, 3 Freeze, click to place |

Local play, and anywhere else on a controller (Steam Deck names):

| Action | Controller |
|--------|------------|
| Take a Seat / leave it (lobby) | A / B |
| Start the match (Host) / pause (anyone) | Menu |
| Throttle / brake | R2 / L2 |
| Steer | Left stick or d-pad |
| Handbrake | A |
| Hazards (when out) | Left stick aims, L1 / R1 switch, A drops |
| Emotes (when out) | D-pad |
| Menus | D-pad or stick moves, A chooses, B backs out |
