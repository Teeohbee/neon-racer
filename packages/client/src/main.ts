import { Application } from "pixi.js";
import { startPractice } from "./practice";

const app = new Application();
await app.init({ resizeTo: window, background: "#05060d", antialias: true });
document.getElementById("stage")!.appendChild(app.canvas);
startPractice(app, document.getElementById("ui")!);
