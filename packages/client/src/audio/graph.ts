import type { EliminationReason, HazardKind } from "@neon/sim";
import { createDanger } from "./danger";
import { createEngines } from "./engines";
import { createMusic } from "./music";
import { volumeToGain, type AudioSettings } from "./settings";
import * as fx from "./sfx";
import type { Out } from "./synth";

const SETTLE = 0.05;

export function createSfx(out: () => Out | null, now: () => number) {
  const play = (fn: (o: Out, t: number) => void) => {
    const o = out();
    if (!o) return;
    try {
      fn(o, now() + 0.005);
    } catch (err) {
      console.warn("sfx failed", err);
    }
  };
  return {
    click: () => play(fx.click),
    countdownTick: () => play(fx.countdownTick),
    go: () => play(fx.go),
    boost: () => play(fx.boost),
    slipstream: () => play(fx.slipstream),
    bump: (intensity = 1, pan = 0) => play((o, t) => fx.bump(o, t, intensity, pan)),
    hazardPlaced: () => play(fx.hazardPlaced),
    hazardArming: (duration?: number) => play((o, t) => fx.hazardArming(o, t, duration)),
    hazardActivate: (kind: HazardKind, pan = 0) => play((o, t) => fx.hazardActivate(o, t, kind, pan)),
    eliminated: (reason: EliminationReason, opts?: fx.EliminationOptions) => play((o, t) => fx.eliminated(o, t, reason, opts)),
    roundWin: () => play(fx.roundWin),
    matchWin: () => play(fx.matchWin),
  };
}

export type Sfx = ReturnType<typeof createSfx>;

export function createGraph(ctx: BaseAudioContext, now: () => number = () => ctx.currentTime) {
  const glue = compressor(ctx, -14, 10, 6, 0.004, 0.25);
  const limiter = compressor(ctx, -3, 0, 20, 0.001, 0.1);
  glue.connect(limiter).connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(glue);
  const musicBus = ctx.createGain();
  const sfxBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(master);

  const music = { ctx, dest: musicBus };
  const sfx = { ctx, dest: sfxBus };
  return {
    music: createMusic(music, now),
    engines: createEngines(sfx, now),
    danger: createDanger(sfx, now),
    sfxOut: sfx,
    apply(settings: AudioSettings) {
      const t = now();
      master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, SETTLE);
      musicBus.gain.setTargetAtTime(volumeToGain(settings.music), t, SETTLE);
      sfxBus.gain.setTargetAtTime(volumeToGain(settings.sfx), t, SETTLE);
    },
  };
}

export type Graph = ReturnType<typeof createGraph>;

function compressor(ctx: BaseAudioContext, threshold: number, knee: number, ratio: number, attack: number, release: number) {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = threshold;
  node.knee.value = knee;
  node.ratio.value = ratio;
  node.attack.value = attack;
  node.release.value = release;
  return node;
}
