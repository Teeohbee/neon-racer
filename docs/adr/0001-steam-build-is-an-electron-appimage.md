# The Steam build is an Electron AppImage

High Rollers reaches the Steam Machine as a single Electron AppImage running Local play and Practice in-process (no server), installed by steam-tools like the Godot games. Electron bundles its own Chromium, so the game runs in the same engine it is developed and tested in, with dependable Gamepad API support and PixiJS WebGL performance; the ~100 MB size does not matter on a games machine.

## Considered Options

- **Tauri**: small binary, but uses WebKitGTK on Linux. Its Gamepad API support is less dependable, WebGL is slower and less predictable, SteamOS's read-only root means the AppImage must bundle WebKitGTK anyway, and it adds a Rust toolchain for a wrapper that does almost nothing.
- **Static build in a Flatpak browser's kiosk mode**: no wrapper code, but flakier in Game Mode and under Steam Input, and depends on a browser being installed on the device.
