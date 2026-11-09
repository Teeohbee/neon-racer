import { Container, Filter, GlProgram, GpuProgram, Rectangle } from "pixi.js";
import { RGBSplitFilter, vertex, wgslVertex } from "pixi-filters";
import { display } from "../display";
import { barrel, kickPulse, overscan, splitOffset, stepPulse } from "./envelopes";
import { createVignette, type ViewRect } from "./vignette";

const CURVE = 0.07;
const FRINGE = 2.5;

const warpFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform float uCurve;
uniform float uGain;
uniform float uFringe;
uniform vec4 uView;
uniform float uOverscan;

void main(void)
{
  vec2 extent = uOutputFrame.zw * uInputSize.zw;
  vec2 p = (((vTextureCoord / extent - uView.xy) / uView.zw) * 2.0 - 1.0) * uOverscan;
  p *= 1.0 + uCurve * dot(p, p);
  vec2 px = 2.0 / (uOutputFrame.zw * uView.zw);
  vec2 mask = clamp((1.0 - abs(p)) / (3.0 * px), 0.0, 1.0);
  vec2 base = (uView.xy + (p * 0.5 + 0.5) * uView.zw) * extent;
  vec2 off = p * dot(p, p) * uFringe * uInputSize.zw;
  vec4 c = texture(uTexture, clamp(base, uInputClamp.xy, uInputClamp.zw));
  c.r = texture(uTexture, clamp(base + off, uInputClamp.xy, uInputClamp.zw)).r;
  c.b = texture(uTexture, clamp(base - off, uInputClamp.xy, uInputClamp.zw)).b;
  finalColor = c * mask.x * mask.y * uGain;
}
`;

const warpSource = `struct WarpUniforms {
  uCurve: f32,
  uGain: f32,
  uFringe: f32,
  uView: vec4<f32>,
  uOverscan: f32,
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
  let view = warpUniforms.uView;
  var p = (((uv / extent - view.xy) / view.zw) * 2.0 - 1.0) * warpUniforms.uOverscan;
  p = p * (1.0 + warpUniforms.uCurve * dot(p, p));
  let px = 2.0 / (gfu.uOutputFrame.zw * view.zw);
  let mask = clamp((vec2<f32>(1.0) - abs(p)) / (3.0 * px), vec2<f32>(0.0), vec2<f32>(1.0));
  let base = (view.xy + (p * 0.5 + 0.5) * view.zw) * extent;
  let off = p * dot(p, p) * warpUniforms.uFringe * gfu.uInputSize.zw;
  var c = textureSample(uTexture, uSampler, clamp(base, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
  c.r = textureSample(uTexture, uSampler, clamp(base + off, gfu.uInputClamp.xy, gfu.uInputClamp.zw)).r;
  c.b = textureSample(uTexture, uSampler, clamp(base - off, gfu.uInputClamp.xy, gfu.uInputClamp.zw)).b;
  return c * mask.x * mask.y * warpUniforms.uGain;
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
        uFringe: { value: FRINGE, type: "f32" },
        uView: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
        uOverscan: { value: overscan(CURVE), type: "f32" },
      },
    },
  });
}


export function createPostFx(root: Container, glitch: { filter: Filter; active(): boolean }) {
  const split = new RGBSplitFilter({ red: [0, 0], green: [0, 0], blue: [0, 0] });
  const warp = warpFilter();
  const vignette = createVignette();
  const area = new Rectangle();
  let tube: ViewRect = { x: 0, y: 0, w: 1, h: 1 };
  let pulse = 0;
  let crtOn = display.get().crt;
  let chain = "";
  root.filterArea = area;
  const unsubscribe = display.subscribe((settings) => (crtOn = settings.crt));

  const applyChain = () => {
    const filters: Filter[] = [];
    if (pulse > 0) filters.push(split);
    if (glitch.active()) filters.push(glitch.filter);
    if (crtOn) filters.push(warp);
    const key = filters.length ? `${pulse > 0}${glitch.active()}${crtOn}` : "";
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
    refresh: applyChain,
    shown(x: number, y: number): [number, number] {
      return crtOn ? barrel(x, y, tube, CURVE) : [x, y];
    },
    update(screen: { w: number; h: number }, view: ViewRect, dt: number) {
      area.width = screen.w;
      area.height = screen.h;
      tube = view;
      const uv = warp.resources.warpUniforms.uniforms.uView as Float32Array;
      uv[0] = view.x / screen.w;
      uv[1] = view.y / screen.h;
      uv[2] = view.w / screen.w;
      uv[3] = view.h / screen.h;
      pulse = stepPulse(pulse, dt);
      const offset = splitOffset(pulse);
      split.red = [-offset, offset * 0.25];
      split.blue = [offset, -offset * 0.25];
      applyChain();
      vignette.update(view, dt);
    },
    destroy() {
      unsubscribe();
      root.filters = [];
      split.destroy();
      warp.destroy();
      vignette.destroy();
    },
  };
}

export type PostFx = ReturnType<typeof createPostFx>;
