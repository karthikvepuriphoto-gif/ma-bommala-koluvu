import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "./text";
import { BigButton } from "./ui";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t, alt: other } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastToggle = useRef(0);

  function remember(nextScale: number, nextPan = panRef.current) {
    scaleRef.current = nextScale;
    panRef.current = nextPan;
    setScale(nextScale);
    setPan(nextPan);
  }

  function setZoom(next: number) {
    const value = clamp(next, MIN_SCALE, MAX_SCALE);
    remember(value, value === MIN_SCALE ? { x: 0, y: 0 } : panRef.current);
  }

  function toggleZoom() {
    const now = Date.now();
    if (now - lastToggle.current < 320) return;
    lastToggle.current = now;
    setZoom(scaleRef.current > 1.05 ? 1 : 2.5);
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLButtonElement>(".photo-viewer .big")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const stage = stageRef.current;
    const blockPageZoom = (event: TouchEvent) => {
      if (event.touches.length > 1 || scaleRef.current > 1) event.preventDefault();
    };
    stage?.addEventListener("touchmove", blockPageZoom, { passive: false });
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      stage?.removeEventListener("touchmove", blockPageZoom);
    };
  }, [onClose]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A synthetic pointer in a test has no active id. */
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: scaleRef.current,
      };
      dragRef.current = null;
      return;
    }
    if (scaleRef.current > 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(pinchRef.current.scale * (distance / pinchRef.current.distance));
      return;
    }
    if (dragRef.current && scaleRef.current > 1) {
      remember(scaleRef.current, {
        x: dragRef.current.panX + (event.clientX - dragRef.current.x),
        y: dragRef.current.panY + (event.clientY - dragRef.current.y),
      });
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) dragRef.current = null;
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="photo-viewer-bar">
        <BigButton label={t.closePhoto} alt={other.closePhoto} onClick={onClose} />
      </div>
      <div
        className="photo-stage"
        ref={stageRef}
        data-scale={scale.toFixed(2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => toggleZoom()}
        onTouchEnd={(event) => {
          if (event.touches.length > 0) return;
          const now = Date.now();
          const previous = Number(stageRef.current?.dataset.lastTap ?? 0);
          if (stageRef.current) stageRef.current.dataset.lastTap = String(now);
          if (now - previous < 300) toggleZoom();
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        />
      </div>
      <div className="photo-viewer-bar">
        <p className="hint zoom-hint">{t.zoomHint}</p>
        <BigButton label={t.zoomOut} alt={other.zoomOut} onClick={() => setZoom(scaleRef.current - 0.6)} />
        <BigButton tone="primary" label={t.zoomIn} alt={other.zoomIn} onClick={() => setZoom(scaleRef.current + 0.6)} />
      </div>
    </div>
  );
}

export function ZoomablePhoto({
  src,
  alt,
  className,
  testId,
}: {
  src: string;
  alt: string;
  className?: string;
  testId?: string;
}) {
  const { t, alt: other } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`photo-launch ${className ?? ""}`}
        aria-label={t.lookCloser}
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={alt} data-testid={testId} />
        <span className="photo-launch-label" aria-hidden="true">
          {t.lookCloser}
          <span className="alt">{other.lookCloser}</span>
        </span>
      </button>
      {open ? <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
