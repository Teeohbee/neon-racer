import { Application } from "pixi.js";
import { audio, audioSettingsWidget, bindAudioMuteKey } from "./audio";
import { h } from "./dom";
import { showMenu, type MenuChoice } from "./menu";
import { startOnline } from "./online";
import { startPractice } from "./practice";

const app = new Application();
await app.init({ resizeTo: window, background: "#05060d", antialias: true });
document.getElementById("stage")!.appendChild(app.canvas);
const ui = document.getElementById("ui")!;

bindAudioMuteKey();

function menu(notice?: string) {
  audio.music.setMood("lobby");
  const close = showMenu(ui, (choice) => {
    close();
    play(choice);
  }, notice);
}

function play(choice: MenuChoice) {
  if (choice.kind === "practice") {
    const stop = startPractice(app, ui);
    const settings = audioSettingsWidget();
    const bar = h("div", { class: "practice-bar" }, h("button", { class: "back", onclick: () => exit() }, "← Menu"), settings.el);
    const exit = () => {
      stop();
      settings.dispose();
      bar.remove();
      menu();
    };
    ui.append(bar);
    return;
  }
  const stop = startOnline(app, ui, { room: choice.kind === "create" ? "new" : choice.room!, name: choice.name }, (reason) => {
    stop();
    history.replaceState(null, "", location.pathname);
    menu(reason);
  });
}

menu();
