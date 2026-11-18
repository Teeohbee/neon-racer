/**
 * What the game can ask of the device it runs on. The Steam build's Electron wrapper exposes
 * `window.highRollers`; in a browser it is missing, so the game cannot quit itself there.
 */

export interface DesktopBridge {
  quit(): void;
}

declare global {
  interface Window {
    highRollers?: DesktopBridge;
  }
}

/** Closes the game, where that is possible (the Steam build). Undefined in a browser. */
export const quitGame: (() => void) | undefined = typeof window !== "undefined" && window.highRollers ? () => window.highRollers!.quit() : undefined;
