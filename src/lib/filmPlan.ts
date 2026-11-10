export const TITLE_MS = 4000;
export const NO_VOICE_MS = 5000;
export const VOICE_PAD_MS = 1000;

export interface PlanDoll {
  id: string;
  step: number | null;
  order: number;
  voiceMs: number | null;
}

export interface PlanSlide {
  kind: "title" | "doll" | "closing";
  dollId?: string;
  durationMs: number;
  voice: boolean;
}

export function defaultOrder(dolls: { id: string; step: number | null; order: number }[]): string[] {
  return [...dolls]
    .sort((a, b) => {
      const aStep = a.step ?? 100;
      const bStep = b.step ?? 100;
      if (aStep !== bStep) return aStep - bStep;
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    })
    .map((doll) => doll.id);
}

export function planSlides(opts: {
  dolls: PlanDoll[];
  orderIds: string[];
  includeIds: string[];
  title: boolean;
  closing: boolean;
}): PlanSlide[] {
  const include = new Set(opts.includeIds);
  const byId = new Map(opts.dolls.map((doll) => [doll.id, doll]));
  const slides: PlanSlide[] = [];
  if (opts.title) slides.push({ kind: "title", durationMs: TITLE_MS, voice: false });
  for (const id of opts.orderIds) {
    if (!include.has(id)) continue;
    const doll = byId.get(id);
    if (!doll) continue;
    const voice = doll.voiceMs != null && doll.voiceMs > 0;
    slides.push({
      kind: "doll",
      dollId: id,
      durationMs: voice ? doll.voiceMs! + VOICE_PAD_MS : NO_VOICE_MS,
      voice,
    });
  }
  if (opts.closing) slides.push({ kind: "closing", durationMs: TITLE_MS, voice: false });
  return slides;
}

export function totalDuration(slides: PlanSlide[]): number {
  return slides.reduce((sum, slide) => sum + slide.durationMs, 0);
}
