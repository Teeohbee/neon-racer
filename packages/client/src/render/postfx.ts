import { Container, Filter, GlProgram, GpuProgram, Rectangle } from "pixi.js";
import { CRTFilter, RGBSplitFilter, vertex, wgslVertex } from "pixi-filters";
import { display } from "../display";
import { crtFlicker, kickPulse, splitOffset, stepPulse } from "./envelopes";
import { createVignette, type ViewRect } from "./vignette";

const CURVE = 0.045;

const warpFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform float uCurve;
uniform float uGain;

void main(void)
{
  vec2 extent = uOutputFrame.zw * uInputSize.zw;
  vec2 p = vTextureCoord / extent * 2.0 - 1.0;
  p *= 1.0 + uCurve * dot(p, p);
  vec2 px = 2.0 / uOutputFrame.zw;
  vec2 mask = clamp((1.0 - abs(p)) / (3.0 * px), 0.0, 1.0);
  vec2 uv = clamp((p * 0.5 + 0.5) * extent, uInputClamp.xy, uInputClamp.zw);
  finalColor = texture(uTexture, uv) * mask.x * mask.y * uGain;
}
`;

const warpSource = `struct WarpUniforms {
  uCurve: f32,
  uGain: f32,
};

struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> warpUniforms: WarpUniforms;

@fragment
fn mainFragment(
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  let extent = gfu.uOutputFrame.zw * gfu.uInputSize.zw;
  var p = uv / extent * 2.0 - 1.0;
  p = p * (1.0 + warpUniforms.uCurve * dot(p, p));
  let px = 2.0 / gfu.uOutputFrame.zw;
  let mask = clamp((vec2<f32>(1.0) - abs(p)) / (3.0 * px), vec2<f32>(0.0), vec2<f32>(1.0));
  let st = clamp((p * 0.5 + 0.5) * extent, gfu.uInputClamp.xy, gfu.uInputClamp.zw);
  return textureSample(uTexture, uSampler, st) * mask.x * mask.y * warpUniforms.uGain;
}
`;

function warpFilter() {
  return new Filter({
    glProgram: GlProgram.from({ vertex, fragment: warpFragment, name: "crt-warp-filter" }),
    gpuProgram: GpuProgram.from({
      vertex: { source: wgslVertex, entryPoint: "mainVertex" },
      fragment: { source: warpSource, entryPoint: "mainFragment" },
    }),
    resources: {
      warpUniforms: {
        uCurve: { value: CURVE, type: "f32" },
        uGain: { value: 1, type: "f32" },
      },
    },
  });
}

export function createPostFx(root: Container) {
  const split = new RGBSplitFilter({ red: [0, 0], green: [0, 0], blue: [0, 0] });
  const crt = new CRTFilter({ curvature: 2, lineWidth: 2, lineContrast: 0.18, noise: 0.035, noiseSize: 1.5, vignetting: 0.28, vignettingAlpha: 0.55, vignettingBlur: 0.35 });
  const warp = warpFilter();
  const vignette = createVignette();
  const area = new Rectangle();
  let pulse = 0;
  let crtOn = display.get().crt;
  let chain = "";
  root.filterArea = area;
  const unsubscribe = display.subscribe((s) => (crtOn = s.crt));

  const applyChain = () => {
    const filters: Filter[] = [];
    if (pulse > 0) filters.push(split);
    if (crtOn) filters.push(crt, warp);
    const key = filters.length ? `${pulse > 0}${crtOn}` : "";
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
    update(screen: { w: number; h: number }, view: ViewRect, dt: number, t: number) {
      area.width = screen.w;
      area.height = screen.h;
      pulse = stepPulse(pulse, dt);
      const offset = splitOffset(pulse);
      split.red = [-offset, offset * 0.25];
      split.blue = [offset, -offset * 0.25];
      if (crtOn) {
        crt.time = t * 4;
        crt.seed = Math.random();
        warp.resources.warpUniforms.uniforms.uGain = crtFlicker(t);
      }
      applyChain();
      vignette.update(view, dt);
    },
    destroy() {
      unsubscribe();
      root.filters = [];
      split.destroy();
      crt.destroy();
      warp.destroy();
      vignette.destroy();
    },
  };
}

export type PostFx = ReturnType<typeof createPostFx>;
