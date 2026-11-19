import "./ui/kit.css";
import { Application } from "pixi.js";
import { audio, audioSettingsWidget, bindAudioMuteKey } from "./audio";
import { displaySettingsWidget } from "./display-widget";
import { bindFpsOverlay } from "./fps-overlay";
import { h } from "./dom";
import { isTyping } from "./input";
import { bindReporting } from "./report";
import { showMenu, type MenuChoice } from "./menu";
import { startOnline } from "./online";
import { startPractice } from "./practice";
import { startLocalPlay } from "./local/local-play";
import { startAttract } from "./shell/attract";
import { glitchSwap } from "./shell/transition";
import { bindViewRect } from "./view-rect";
import { startControllerHub } from "./controller/hub";
import { bindControllerMenus, KEYBOARD_CONTROLLER_ID, noController } from "./controller/menu-bridge";
import { quitGame } from "./platform";
import { STEAM_BUILD } from "./build-flags";
import { browserGamepads } from "./controller/poller";
import { combinePadSources, keyboardPadSource } from "./controller/keyboard-pad";

const app = new Application();
await app.init({ resizeTo: window, background: "#05060d", antialias: true });
document.getElementById("stage")!.appendChild(app.canvas);
// Reports go to the game server, which the Steam build doesn't have.
if (!STEAM_BUILD) bindReporting(app);
const ui = document.getElementById("ui")!;
bindViewRect(document.documentElement);

bindAudioMuteKey();
bindFpsOverlay(ui);

const controllers = startControllerHub(import.meta.env.DEV ? combinePadSources(browserGamepads(), keyboardPadSource()) : browserGamepads());
const controllerMenus = bindControllerMenus(controllers);
let releaseMenus = () => {};
// Browsers hold sound until the first click or key, so the web waits for one. The Steam build's Electron
// allows it from the start (desktop/main.cjs), and a controller press is no gesture, so start it now.
if (STEAM_BUILD) audio.unlock();

function menu(notice?: string) {
  audio.music.setMood("lobby");
  releaseMenus();
  const attract = startAttract(app);
  let chosen = false;
  const close = showMenu(ui, { quitGame, offline: STEAM_BUILD }, (choice) => {
    if (chosen) return;
    chosen = true;
    void glitchSwap(() => {
      close();
      attract.stop();
      play(choice);
    });
  }, notice);
}

function play(choice: MenuChoice) {
  releaseMenus();
  releaseMenus = controllerMenus.restrict(noController);
  if (choice.kind === "practice") {
    const stop = startPractice(app, ui, controllers);
    const settings = audioSettingsWidget();
    const displaySettings = displaySettingsWidget();
    const bar = h("div", { class: "practice-bar" }, h("button", { class: "back", onclick: () => exit() }, "← Menu (Esc)"), settings.el, displaySettings.el);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !isTyping(e.target)) exit();
    };
    let leaving = false;
    const exit = () => {
      if (leaving) return;
      leaving = true;
      void glitchSwap(() => {
        window.removeEventListener("keydown", onEscape);
        unsubscribeBack();
        stop();
        settings.dispose();
        displaySettings.dispose();
        bar.remove();
        menu();
      });
    };
    window.addEventListener("keydown", onEscape);
    const unsubscribeBack = controllers.subscribe((frame) => {
      if ([...frame.pads.keys()].some((id) => id !== KEYBOARD_CONTROLLER_ID && frame.pressed(id, "b"))) exit();
    });
    ui.append(bar);
    return;
  }
  if (choice.kind === "local") {
    const stop = startLocalPlay(app, ui, { controllers, menus: controllerMenus, quitGame }, () =>
      glitchSwap(() => {
        stop();
        menu();
      }),
    );
    return;
  }
  const stop = startOnline(app, ui, { room: choice.kind === "create" ? "new" : choice.room!, name: choice.name }, (reason) =>
    glitchSwap(() => {
      stop();
      history.replaceState(null, "", location.pathname);
      menu(reason);
    }),
  );
}

menu();
