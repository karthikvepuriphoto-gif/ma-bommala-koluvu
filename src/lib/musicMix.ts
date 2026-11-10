export const DUCK_DB = -15;
export const FADE_IN_SEC = 1.2;
export const FADE_OUT_SEC = 1.6;
export const DUCK_RAMP_SEC = 0.35;

export const MUSIC_GAIN = {
  soft: 0.22,
  medium: 0.45,
} as const;

export type MusicLevel = keyof typeof MUSIC_GAIN;

export interface VoiceSpan {
  startSec: number;
  endSec: number;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function musicGainAt(
  time: number,
  opts: {
    durationSec: number;
    baseGain: number;
    voices: VoiceSpan[];
    duckDb?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    rampSec?: number;
  },
): number {
  const fadeIn = opts.fadeInSec ?? FADE_IN_SEC;
  const fadeOut = opts.fadeOutSec ?? FADE_OUT_SEC;
  const ramp = opts.rampSec ?? DUCK_RAMP_SEC;
  const ducked = dbToGain(opts.duckDb ?? DUCK_DB);
  const duration = opts.durationSec;
  if (time <= 0 || time >= duration) return 0;

  let fade = 1;
  if (time < fadeIn) fade = time / fadeIn;
  const fadeOutStart = Math.max(0, duration - fadeOut);
  if (time > fadeOutStart) fade = Math.min(fade, (duration - time) / Math.max(fadeOut, 0.001));

  let duck = 1;
  for (const voice of opts.voices) {
    const { startSec, endSec } = voice;
    if (endSec <= startSec) continue;
    if (time >= startSec && time <= endSec) duck = Math.min(duck, ducked);
    else if (time >= startSec - ramp && time < startSec) {
      const portion = (time - (startSec - ramp)) / ramp;
      duck = Math.min(duck, 1 + (ducked - 1) * portion);
    } else if (time > endSec && time <= endSec + ramp) {
      const portion = (time - endSec) / ramp;
      duck = Math.min(duck, ducked + (1 - ducked) * portion);
    }
  }
  return opts.baseGain * fade * duck;
}

export function voiceSpansFromBuffers(
  slides: { durationMs: number; voice: boolean }[],
  bufferSeconds: Array<number | null>,
): VoiceSpan[] {
  const spans: VoiceSpan[] = [];
  let cursor = 0;
  slides.forEach((slide, index) => {
    const slideSec = slide.durationMs / 1000;
    const heard = bufferSeconds[index];
    if (slide.voice && heard != null && heard > 0) {
      spans.push({ startSec: cursor, endSec: cursor + Math.min(slideSec, heard) });
    }
    cursor += slideSec;
  });
  return spans;
}
