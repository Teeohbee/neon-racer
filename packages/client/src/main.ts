import { Application } from "pixi.js";
import { h } from "./dom";
import { showMenu, type MenuChoice } from "./menu";
import { startOnline } from "./online";
import { startPractice } from "./practice";

const app = new Application();
await app.init({ resizeTo: window, background: "#05060d", antialias: true });
document.getElementById("stage")!.appendChild(app.canvas);
const ui = document.getElementById("ui")!;

function menu(notice?: string) {
  const close = showMenu(ui, (choice) => {
    close();
    play(choice);
  }, notice);
}

function play(choice: MenuChoice) {
  if (choice.kind === "practice") {
    const stop = startPractice(app, ui);
    const back = h("button", { class: "back", onclick: () => exit() }, "← Menu");
    const exit = () => {
      stop();
      back.remove();
      menu();
    };
    ui.append(back);
    return;
  }
  const stop = startOnline(app, ui, { room: choice.kind === "create" ? "new" : choice.room!, name: choice.name }, (reason) => {
    stop();
    history.replaceState(null, "", location.pathname);
    menu(reason);
  });
}

menu();
