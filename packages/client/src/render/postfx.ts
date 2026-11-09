import { Container, Filter, GlProgram, GpuProgram, Rectangle } from "pixi.js";
import { CRTFilter, RGBSplitFilter, vertex, wgslVertex } from "pixi-filters";
import { display } from "../display";
import { crtFlicker, kickPulse, splitOffset, stepPulse } from "./envelopes";
import { createVignette, type ViewRect } from "./vignette";

const CURVE = 0.07;
const FRINGE = 2.5;
const MASK = 0.28;

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
uniform float uMask;
uniform float uTime;

void main(void)
{
  vec2 extent = uOutputFrame.zw * uInputSize.zw;
  vec2 p = vTextureCoord / extent * 2.0 - 1.0;
  p *= 1.0 + uCurve * dot(p, p);
  vec2 px = 2.0 / uOutputFrame.zw;
  vec2 mask = clamp((1.0 - abs(p)) / (3.0 * px), 0.0, 1.0);
  vec2 base = (p * 0.5 + 0.5) * extent;
  vec2 off = p * dot(p, p) * uFringe * uInputSize.zw;
  vec4 c = texture(uTexture, clamp(base, uInputClamp.xy, uInputClamp.zw));
  c.r = texture(uTexture, clamp(base + off, uInputClamp.xy, uInputClamp.zw)).r;
  c.b = texture(uTexture, clamp(base - off, uInputClamp.xy, uInputClamp.zw)).b;
  float triad = mod(floor((p.x * 0.5 + 0.5) * uOutputFrame.z), 3.0);
  vec3 phosphor = vec3(step(triad, 0.5), step(0.5, triad) * step(triad, 1.5), step(1.5, triad));
  c.rgb *= mix(vec3(1.0), 0.75 + phosphor * 0.75, uMask);
  float roll = fract((p.y * 0.5 + 0.5) - uTime * 0.11) - 0.5;
  c.rgb *= 1.0 + 0.1 * exp(-roll * roll * 180.0);
  finalColor = c * mask.x * mask.y * uGain;
}
`;

const warpSource = `struct WarpUniforms {
  uCurve: f32,
  uGain: f32,
  uFringe: f32,
  uMask: f32,
  uTime: f32,
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
  let base = (p * 0.5 + 0.5) * extent;
  let off = p * dot(p, p) * warpUniforms.uFringe * gfu.uInputSize.zw;
  var c = textureSample(uTexture, uSampler, clamp(base, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
  c.r = textureSample(uTexture, uSampler, clamp(base + off, gfu.uInputClamp.xy, gfu.uInputClamp.zw)).r;
  c.b = textureSample(uTexture, uSampler, clamp(base - off, gfu.uInputClamp.xy, gfu.uInputClamp.zw)).b;
  let triad = floor((p.x * 0.5 + 0.5) * gfu.uOutputFrame.z) % 3.0;
  let phosphor = vec3<f32>(step(triad, 0.5), step(0.5, triad) * step(triad, 1.5), step(1.5, triad));
  let tinted = c.rgb * mix(vec3<f32>(1.0), vec3<f32>(0.75) + phosphor * 0.75, warpUniforms.uMask);
  let roll = fract((p.y * 0.5 + 0.5) - warpUniforms.uTime * 0.11) - 0.5;
  let lit = tinted * (1.0 + 0.1 * exp(-roll * roll * 180.0));
  return vec4<f32>(lit, c.a) * mask.x * mask.y * warpUniforms.uGain;
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
        uMask: { value: MASK, type: "f32" },
        uTime: { value: 0, type: "f32" },
      },
    },
  });
}

export function createPostFx(root: Container, glitch: { filter: Filter; active(): boolean }) {
  const split = new RGBSplitFilter({ red: [0, 0], green: [0, 0], blue: [0, 0] });
  const crt = new CRTFilter({ curvature: 2, lineWidth: 3, lineContrast: 0.42, noise: 0.08, noiseSize: 1.5, vignetting: 0.32, vignettingAlpha: 0.8, vignettingBlur: 0.3 });
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
    if (glitch.active()) filters.push(glitch.filter);
    if (crtOn) filters.push(crt, warp);
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
        warp.resources.warpUniforms.uniforms.uTime = t;
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
