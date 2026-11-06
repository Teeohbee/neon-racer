import { createAudio } from "./audio/runtime";
import { bindMuteKey, createAudioSettings } from "./audio/widget";

export const audio = createAudio();

export const audioSettingsWidget = () => createAudioSettings(audio.settings, audio.sfx.click);
export const bindAudioMuteKey = (target: Window = window) => bindMuteKey(audio.settings, target);
export { dangerLevel } from "./audio/levels";
export { screenPan } from "./audio/voices";
export type { Mood } from "./audio/sequencer";
export type { AudibleCar } from "./audio/voices";

export const sfx = {
  tick: () => audio.sfx.countdownTick(),
  go: () => audio.sfx.go(),
  blip: () => audio.sfx.eliminated("screen", { you: false }),
  out: () => audio.sfx.eliminated("screen"),
  win: () => audio.sfx.roundWin(),
};

const LEGACY_CAMERA = { x: 0, y: 0, scale: 1 };

export function createEngineSound() {
  return {
    update(speed: number) {
      audio.engines.update([{ id: "legacy", x: 0, y: 0, speed, isYou: true, alive: speed > 0 }], LEGACY_CAMERA);
    },
    stop() {
      audio.engines.stop();
    },
  };
}
