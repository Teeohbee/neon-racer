import { Container, Graphics } from "pixi.js";
import { fallPose, type FallStart } from "./falling";

interface Falling {
  start: FallStart;
  body: Graphics;
  elapsed: number;
}

export function createFallLayer(drawBody: (g: Graphics) => void) {
  const view = new Container();
  let falls: Falling[] = [];

  return {
    view,
    add(start: FallStart) {
      const body = new Graphics();
      drawBody(body);
      body.tint = start.color;
      view.addChild(body);
      falls.push({ start, body, elapsed: 0 });
    },
    has(id: string) {
      return falls.some((f) => f.start.id === id);
    },
    update(dt: number) {
      falls = falls.filter((f) => {
        f.elapsed += dt;
        const pose = fallPose(f.start, f.elapsed);
        if (pose.done) {
          f.body.destroy();
          return false;
        }
        f.body.position.set(pose.x, pose.y);
        f.body.rotation = pose.angle;
        f.body.scale.set(pose.scale);
        f.body.alpha = pose.alpha;
        return true;
      });
    },
  };
}
