// What the game may ask of the desktop: only to quit. The client reads this as `window.highRollers` (packages/client/src/platform.ts).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("highRollers", { quit: () => ipcRenderer.send("quit") });
