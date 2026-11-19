// The Steam build's wrapper: one fullscreen window running the client from disk. See docs/adr/0001.
const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const CLIENT_DIR = path.join(__dirname, "client");
const SCHEME = "app";
const CRASH_RELOAD_GAP_MS = 30_000;

// Music starts without a click: on the Machine there is no mouse to give one.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// An AppImage can't ship Chromium's setuid sandbox helper, and the window only ever loads the game from disk.
app.commandLine.appendSwitch("no-sandbox");

// On SteamOS, Chromium's default OpenGL-over-X11 path isn't in step with gamescope's display: frames go out on
// Chromium's own timer and judder at 90 Hz. Through Vulkan, gamescope paces presentation to the display.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("use-angle", "vulkan");
  app.commandLine.appendSwitch("enable-features", "Vulkan,DefaultANGLEVulkan,VulkanFromANGLE");
}

// Serve the built client from app://game/ rather than file://, so its module scripts and absolute asset paths load as they do on the web.
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveClient() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(CLIENT_DIR, decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));
    if (!file.startsWith(CLIENT_DIR)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString()).catch(() => new Response("Not found", { status: 404 }));
  });
}

function openWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#05060d",
    title: "High Rollers",
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });
  win.setMenu(null);
  win.webContents.on("did-finish-load", () => void win.webContents.insertCSS("*, *::before, *::after { cursor: none !important; }"));
  // A crashed page leaves a black window that a pad can't get out of, so start the game again.
  // Not when it crashed moments ago too: then it would only crash again.
  let lastCrashAt = 0;
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`page gone: ${details.reason} (exit ${details.exitCode})`);
    if (details.reason === "clean-exit") return;
    const now = Date.now();
    if (now - lastCrashAt < CRASH_RELOAD_GAP_MS) return;
    lastCrashAt = now;
    void win.loadURL(`${SCHEME}://game/`);
  });
  void win.loadURL(`${SCHEME}://game/`);
}

ipcMain.on("quit", () => app.quit());

app.whenReady().then(() => {
  serveClient();
  openWindow();
});
app.on("window-all-closed", () => app.quit());
