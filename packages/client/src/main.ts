import "./ui/kit.css";
import { Application } from "pixi.js";
import { audio, audioSettingsWidget, bindAudioMuteKey } from "./audio";
import { displaySettingsWidget } from "./display-widget";
import { bindFpsOverlay } from "./fps-overlay";
import { h } from "./dom";
import { isTyping } from "./input";
import { showMenu, type MenuChoice } from "./menu";
import { startOnline } from "./online";
import { startPractice } from "./practice";
import { startAttract } from "./shell/attract";
import { glitchSwap } from "./shell/transition";
import { bindViewRect } from "./view-rect";

const app = new Application();
await app.init({ resizeTo: window, background: "#05060d", antialias: true });
document.getElementById("stage")!.appendChild(app.canvas);
const ui = document.getElementById("ui")!;
bindViewRect(document.documentElement);

bindAudioMuteKey();
bindFpsOverlay(ui);

function menu(notice?: string) {
  audio.music.setMood("lobby");
  const attract = startAttract(app);
  let chosen = false;
  const close = showMenu(ui, (choice) => {
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
  if (choice.kind === "practice") {
    const stop = startPractice(app, ui);
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
        stop();
        settings.dispose();
        displaySettings.dispose();
        bar.remove();
        menu();
      });
    };
    window.addEventListener("keydown", onEscape);
    ui.append(bar);
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
