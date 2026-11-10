#!/usr/bin/env python3
"""Synthesize original loopable instrumental beds for Ma Bommala Koluvu.

These are not recordings of anyone else's music. Every sample is generated
here from oscillators, a simple plucked-string model, and shaped noise.
"""

from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "music"
SR = 22050
LOOP = 12.0


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SR * seconds), dtype=np.float64)


def karplus(freq: float, seconds: float, decay: float = 0.996) -> np.ndarray:
    n = max(2, int(SR / freq))
    buf = np.random.uniform(-1, 1, n)
    out = np.zeros(int(SR * seconds))
    idx = 0
    for i in range(len(out)):
        out[i] = buf[idx]
        nxt = 0.5 * (buf[idx] + buf[(idx + 1) % n]) * decay
        buf[idx] = nxt
        idx = (idx + 1) % n
    return out


def tone(freq: float, seconds: float, harmonics: list[tuple[int, float]], decay: float) -> np.ndarray:
    n = int(SR * seconds)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for h, amp in harmonics:
        f = freq * h * (1 + 0.0006 * h)
        y += amp * np.sin(2 * np.pi * f * t) * np.exp(-t * decay * h)
    return y


def tanpura_hit(freq: float, seconds: float = 3.2) -> np.ndarray:
    y = tone(freq, seconds, [(1, 1), (2, 0.32), (3, 0.16), (4, 0.07)], decay=0.85)
    n = len(y)
    noise = np.random.uniform(-1, 1, n)
    buzz = np.zeros(n)
    acc = 0.0
    for i, sample in enumerate(noise):
        acc = 0.9 * acc + 0.1 * sample
        buzz[i] = acc
    t = np.arange(n) / SR
    y += buzz * np.exp(-t * 9) * 0.12
    return y


def flute_note(freq: float, seconds: float) -> np.ndarray:
    n = int(SR * seconds)
    t = np.arange(n) / SR
    vibrato = 1 + 0.004 * np.sin(2 * np.pi * 5 * t)
    phase = 2 * np.pi * freq * np.cumsum(vibrato) / SR
    breath = np.random.uniform(-1, 1, n)
    smooth = np.zeros(n)
    acc = 0.0
    for i, sample in enumerate(breath):
        acc = 0.97 * acc + 0.03 * sample
        smooth[i] = acc
    attack = np.minimum(1, t / 0.08)
    release = np.minimum(1, (seconds - t) / 0.12)
    env = attack * release
    y = (np.sin(phase) + 0.18 * np.sin(2 * phase) + 0.04 * smooth) * env
    return y


def place(base: np.ndarray, clip: np.ndarray, at: float) -> None:
    start = int(at * SR)
    end = min(len(base), start + len(clip))
    if start >= len(base) or end <= start:
        return
    base[start:end] += clip[: end - start]


def seamless(rendered: np.ndarray, loop_samples: int, fade_ms: float = 80) -> np.ndarray:
    fade = int(SR * fade_ms / 1000)
    body = rendered[:loop_samples].copy()
    tail = rendered[loop_samples : loop_samples + fade]
    if len(tail) < fade:
        tail = np.pad(tail, (0, fade - len(tail)))
    ramp = np.linspace(0, 1, fade)
    body[:fade] = body[:fade] * ramp + tail * (1 - ramp)
    return body


def normalize(y: np.ndarray, peak: float = 0.35) -> np.ndarray:
    m = np.max(np.abs(y)) or 1
    return (y / m * peak).astype(np.float32)


def write_wav(path: Path, y: np.ndarray) -> None:
    import wave

    pcm = np.clip(y, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


def drone() -> np.ndarray:
    total = LOOP + 2
    y = silence(total)
    hits = [(130.81, 0.0), (261.63, 0.75), (196.00, 1.5), (261.63, 2.25)]
    for cycle in range(6):
        base = cycle * 2.4
        for freq, when in hits:
            place(y, tanpura_hit(freq, 3.4) * 0.8, base + when)
    return seamless(y, int(SR * LOOP))


PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]


def flute() -> np.ndarray:
    total = LOOP + 2
    bed = silence(total)
    for cycle in range(5):
        place(bed, tanpura_hit(130.81, 3.0) * 0.35, cycle * 2.4)
        place(bed, tanpura_hit(196.00, 3.0) * 0.22, cycle * 2.4 + 1.2)
    # Original slow phrase in a pentatonic scale. Durations sum to 12 seconds.
    notes = [
        (0, 0.9), (2, 0.6), (3, 0.9), (4, 0.6), (3, 0.9), (2, 0.6), (1, 0.9), (0, 1.2),
        (3, 0.6), (4, 0.6), (5, 0.9), (4, 0.6), (3, 0.9), (2, 0.6), (0, 1.2),
    ]
    at = 0.0
    line = silence(total)
    for degree, dur in notes:
        place(line, flute_note(PENTA[degree], dur), at)
        at += dur
    mixed = bed[: len(line)] * 0.55 + line * 0.9
    return seamless(mixed, int(SR * LOOP))


def veena() -> np.ndarray:
    total = LOOP + 2
    bed = silence(total)
    for cycle in range(5):
        place(bed, tanpura_hit(130.81, 3.2) * 0.28, cycle * 2.4)
    line = silence(total)
    notes = [(0, 1.2), (3, 0.8), (-1, 0.4), (4, 1.0), (2, 1.2), (0, 1.4), (5, 0.8), (3, 1.0), (1, 0.8), (0, 2.4)]
    at = 0.15
    for degree, dur in notes:
        if degree >= 0:
            place(line, karplus(PENTA[degree], dur, decay=0.994) * 0.7, at)
        at += dur
    mixed = bed + line
    return seamless(mixed, int(SR * LOOP))


def drums() -> np.ndarray:
    total = LOOP + 2
    y = silence(total)
    low = tone(90, 0.45, [(1, 1), (2, 0.25)], decay=8)
    n = int(SR * 0.12)
    noise = np.random.uniform(-1, 1, n) * np.linspace(1, 0, n)
    high = tone(180, 0.18, [(1, 1)], decay=14) + np.pad(noise, (0, max(0, int(SR * 0.18) - n)))
    for i in range(8):
        base = i * 1.5
        place(y, low * 0.9, base)
        place(y, high * 0.45, base + 0.75)
    # A few quiet flute answers, original and sparse.
    place(y, flute_note(PENTA[0], 1.1) * 0.35, 0.3)
    place(y, flute_note(PENTA[3], 0.9) * 0.28, 3.2)
    place(y, flute_note(PENTA[2], 1.0) * 0.28, 6.1)
    place(y, flute_note(PENTA[0], 1.3) * 0.32, 9.2)
    return seamless(y, int(SR * LOOP))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tracks = {
        "drone": drone(),
        "flute": flute(),
        "veena": veena(),
        "drums": drums(),
    }
    import subprocess

    for name, audio in tracks.items():
        wav = OUT / f"{name}.wav"
        mp3 = OUT / f"{name}.mp3"
        write_wav(wav, normalize(audio))
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "7", "-ac", "1", str(mp3)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wav.unlink()
        print(f"{name}: {mp3.stat().st_size} bytes")


if __name__ == "__main__":
    main()
