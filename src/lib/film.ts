import type { PlanSlide } from "./filmPlan";

export function pickVideoMime(isSupported: (type: string) => boolean): { mime: string; ext: "mp4" | "webm" } {
  if (isSupported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
  if (isSupported("video/webm;codecs=vp9,opus")) return { mime: "video/webm;codecs=vp9,opus", ext: "webm" };
  if (isSupported("video/webm;codecs=vp8,opus")) return { mime: "video/webm;codecs=vp8,opus", ext: "webm" };
  if (isSupported("video/webm")) return { mime: "video/webm", ext: "webm" };
  return { mime: "", ext: "webm" };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words.length ? words : [text]) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawCard(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FBF3E4";
  ctx.fillRect(0, 0, width, height);
  const stepW = width * 0.08;
  const base = height * 0.72;
  for (let i = 0; i < 4; i += 1) {
    const h = height * (0.05 + i * 0.035);
    const x = width * 0.34 + i * (stepW + 8);
    ctx.fillStyle = "#6E1E2A";
    ctx.fillRect(x, base - h, stepW, h);
    ctx.fillStyle = "#E1A325";
    ctx.fillRect(x, base - h, stepW, Math.max(6, height * 0.012));
  }
  ctx.fillStyle = "#6E1E2A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(height * 0.07)}px "Noto Sans Telugu", sans-serif`;
  const lines = wrapText(ctx, text, width * 0.8);
  lines.forEach((line, index) => {
    const y = height * 0.38 + (index - (lines.length - 1) / 2) * height * 0.09;
    ctx.fillText(line, width / 2, y);
  });
  ctx.restore();
}

function drawDoll(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  caption: string,
  progress: number,
  alpha: number,
  panSign: number,
) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#2A140F";
  ctx.fillRect(0, 0, width, height);
  if (image && image.naturalWidth > 0) {
    const zoom = 1.04 + progress * 0.1;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    let drawW: number;
    let drawH: number;
    if (imageRatio > canvasRatio) {
      drawH = height * zoom;
      drawW = drawH * imageRatio;
    } else {
      drawW = width * zoom;
      drawH = drawW / imageRatio;
    }
    const pan = (progress - 0.5) * width * 0.05 * panSign;
    ctx.drawImage(image, (width - drawW) / 2 + pan, (height - drawH) / 2, drawW, drawH);
  }
  const bar = Math.round(height * 0.18);
  ctx.fillStyle = "rgba(251, 243, 228, 0.94)";
  ctx.fillRect(0, height - bar, width, bar);
  ctx.fillStyle = "#6E1E2A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(height * 0.06)}px "Noto Sans Telugu", sans-serif`;
  const lines = wrapText(ctx, caption || " ", width * 0.86);
  lines.forEach((line, index) => {
    const y = height - bar / 2 + (index - (lines.length - 1) / 2) * height * 0.07;
    ctx.fillText(line, width / 2, y);
  });
  ctx.restore();
}

function slideIndex(slides: PlanSlide[], elapsed: number) {
  let start = 0;
  for (let index = 0; index < slides.length; index += 1) {
    const duration = slides[index]!.durationMs;
    if (elapsed < start + duration || index === slides.length - 1) {
      return { index, local: Math.max(0, Math.min(duration, elapsed - start)) };
    }
    start += duration;
  }
  return { index: 0, local: 0 };
}

export async function renderFilm(opts: {
  canvas: HTMLCanvasElement;
  slides: PlanSlide[];
  title: string;
  closing: string;
  names: Map<string, string>;
  images: Map<string, HTMLImageElement>;
  voices: Map<string, Blob>;
  width: number;
  height: number;
  bitrate: number;
  onProgress: (ratio: number) => void;
}): Promise<{ blob: Blob; mimeType: string; ext: string }> {
  if (!opts.slides.length) throw new Error("empty-film");
  if (typeof MediaRecorder === "undefined" || typeof opts.canvas.captureStream !== "function") {
    throw new Error("recorder-missing");
  }
  opts.canvas.width = opts.width;
  opts.canvas.height = opts.height;
  const ctx = opts.canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas");
  await document.fonts.ready.catch(() => undefined);

  const total = opts.slides.reduce((sum, slide) => sum + slide.durationMs, 0);
  const chosen = pickVideoMime((type) => MediaRecorder.isTypeSupported(type));
  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(dest);
  osc.start();

  const buffers = new Map<string, AudioBuffer>();
  for (const slide of opts.slides) {
    if (!slide.dollId || !slide.voice) continue;
    const blob = opts.voices.get(slide.dollId);
    if (!blob) continue;
    try {
      const bytes = await blob.arrayBuffer();
      buffers.set(slide.dollId, await audioCtx.decodeAudioData(bytes.slice(0)));
    } catch {
      /* keep the picture even if the note cannot be decoded */
    }
  }

  const lead = 0.25;
  const startAt = audioCtx.currentTime + lead;
  let offset = 0;
  for (const slide of opts.slides) {
    if (slide.dollId && buffers.has(slide.dollId)) {
      const source = audioCtx.createBufferSource();
      source.buffer = buffers.get(slide.dollId)!;
      source.connect(dest);
      const when = startAt + offset / 1000;
      source.start(when);
      try {
        source.stop(when + slide.durationMs / 1000);
      } catch {
        /* already scheduled */
      }
    }
    offset += slide.durationMs;
  }

  const paint = (elapsed: number) => {
    const { index, local } = slideIndex(opts.slides, elapsed);
    const slide = opts.slides[index]!;
    const fade = Math.min(450, slide.durationMs / 3);
    const fadeIn = local < fade ? local / fade : 1;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FBF3E4";
    ctx.fillRect(0, 0, opts.width, opts.height);
    const drawOne = (item: PlanSlide, progress: number, alpha: number, sign: number) => {
      if (item.kind === "title") drawCard(ctx, opts.title, alpha);
      else if (item.kind === "closing") drawCard(ctx, opts.closing, alpha);
      else drawDoll(ctx, item.dollId ? opts.images.get(item.dollId) : undefined, item.dollId ? opts.names.get(item.dollId) ?? "" : "", progress, alpha, sign);
    };
    if (index > 0 && local < fade) {
      const prev = opts.slides[index - 1]!;
      drawOne(prev, 1, 1 - fadeIn, (index - 1) % 2 === 0 ? 1 : -1);
    }
    drawOne(slide, slide.durationMs ? local / slide.durationMs : 0, index > 0 && local < fade ? fadeIn : Math.min(fadeIn, local > slide.durationMs - fade ? (slide.durationMs - local) / fade : 1), index % 2 === 0 ? 1 : -1);
  };

  paint(0);
  const stream = new MediaStream([
    ...opts.canvas.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  let recorder: MediaRecorder;
  try {
    recorder = chosen.mime
      ? new MediaRecorder(stream, { mimeType: chosen.mime, videoBitsPerSecond: opts.bitrate, audioBitsPerSecond: 128_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: opts.bitrate, audioBitsPerSecond: 128_000 });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve());
    recorder.addEventListener("error", () => reject(new Error("recorder")));
  });
  recorder.start(200);

  const wall0 = performance.now() + lead * 1000;
  await new Promise<void>((resolve) => {
    const wait = () => {
      if (performance.now() < wall0) {
        paint(0);
        requestAnimationFrame(wait);
        return;
      }
      const tick = () => {
        const elapsed = performance.now() - wall0;
        const clamped = Math.max(0, Math.min(total, elapsed));
        paint(clamped);
        opts.onProgress(total ? Math.min(1, clamped / total) : 1);
        if (elapsed >= total) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    };
    wait();
  });

  await new Promise((resolve) => window.setTimeout(resolve, 180));
  if (recorder.state !== "inactive") recorder.stop();
  await stopped;
  try {
    osc.stop();
    await audioCtx.close();
  } catch {
    /* already closed */
  }
  stream.getTracks().forEach((track) => track.stop());
  const mimeType = recorder.mimeType || chosen.mime || "video/webm";
  const ext = mimeType.includes("mp4") ? "mp4" : chosen.ext;
  return { blob: new Blob(chunks, { type: mimeType }), mimeType, ext };
}
