import { describe, expect, test } from "vitest";
import {
  DUCK_DB,
  MUSIC_GAIN,
  dbToGain,
  musicGainAt,
  voiceSpansFromBuffers,
} from "../../src/lib/musicMix";

const base = MUSIC_GAIN.soft;

describe("film music mixing", () => {
  test("fades in, ducks about 15 dB under a voice, then returns and fades out", () => {
    const voices = [{ startSec: 3, endSec: 6 }];
    const opts = { durationSec: 12, baseGain: base, voices };
    expect(musicGainAt(0, opts)).toBe(0);
    expect(musicGainAt(12, opts)).toBe(0);
    expect(musicGainAt(1.2, opts)).toBeCloseTo(base, 5);

    const ducked = base * dbToGain(DUCK_DB);
    expect(dbToGain(DUCK_DB)).toBeCloseTo(10 ** (-15 / 20), 6);
    expect(musicGainAt(4.5, opts)).toBeCloseTo(ducked, 4);
    expect(ducked).toBeLessThan(base * 0.2);

    const after = musicGainAt(7, opts);
    expect(after).toBeCloseTo(base, 2);

    const rampMid = musicGainAt(3 - 0.35 / 2, opts);
    expect(rampMid).toBeGreaterThan(ducked);
    expect(rampMid).toBeLessThan(base);
  });

  test("soft is the quieter preset", () => {
    expect(MUSIC_GAIN.soft).toBeLessThan(MUSIC_GAIN.medium);
  });

  test("voice windows follow the decoded note, not the whole slide", () => {
    const spans = voiceSpansFromBuffers(
      [
        { durationMs: 4000, voice: false },
        { durationMs: 3000, voice: true },
        { durationMs: 5000, voice: false },
      ],
      [null, 1.8, null],
    );
    expect(spans).toEqual([{ startSec: 4, endSec: 5.8 }]);
  });
});
