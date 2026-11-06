import { Container, Filter, Rectangle } from "pixi.js";
import { RGBSplitFilter } from "pixi-filters";
import { kickPulse, splitOffset, stepPulse } from "./envelopes";
import { createVignette, type ViewRect } from "./vignette";

export function createPostFx(root: Container) {
  const split = new RGBSplitFilter({ red: [0, 0], green: [0, 0], blue: [0, 0] });
  const vignette = createVignette();
  const area = new Rectangle();
  let pulse = 0;
  let chain = "";
  root.filterArea = area;

  const applyChain = () => {
    const filters: Filter[] = [];
    if (pulse > 0) filters.push(split);
    const key = filters.length ? `${pulse > 0}` : "";
    if (key === chain) return;
    chain = key;
    root.filters = filters;
  };

  return {
    vignette: vignette.view,
    pulse(strength: number) {
      pulse = kickPulse(pulse, strength);
    },
    danger(level: number) {
      vignette.set(level);
    },
    update(screen: { w: number; h: number }, view: ViewRect, dt: number) {
      area.width = screen.w;
      area.height = screen.h;
      pulse = stepPulse(pulse, dt);
      const offset = splitOffset(pulse);
      split.red = [-offset, offset * 0.25];
      split.blue = [offset, -offset * 0.25];
      applyChain();
      vignette.update(view, dt);
    },
    destroy() {
      root.filters = [];
      split.destroy();
      vignette.destroy();
    },
  };
}

export type PostFx = ReturnType<typeof createPostFx>;
