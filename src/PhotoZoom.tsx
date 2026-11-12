import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "./text";
import { BigButton } from "./ui";

const MIN_SCALE = 1;
const MAX_SCALE = 8;

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

/**
 * The picture opens already filling the screen (a photos-app expand).
 * Scale 1 is the whole photo fitted inside the screen. The opening scale
 * is larger than that whenever the photo must be cropped to fill the screen.
 */
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t, alt: other } = useI18n();
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [fit, setFit] = useState({ w: 0, h: 0, fill: 1 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const fitRef = useRef({ w: 0, h: 0, fill: 1 });
  const viewRef = useRef({ w: 1, h: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastToggle = useRef(0);
  const lastTap = useRef(0);
  const moved = useRef(false);
  const suppressClose = useRef(false);
  const suppressTimer = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function clampPan(nextScale: number, nextPan: { x: number; y: number }) {
    const box = fitRef.current;
    const view = viewRef.current;
    const maxX = Math.max(0, (box.w * nextScale - view.w) / 2);
    const maxY = Math.max(0, (box.h * nextScale - view.h) / 2);
    return { x: clamp(nextPan.x, -maxX, maxX), y: clamp(nextPan.y, -maxY, maxY) };
  }

  function commit(nextScale: number, nextPan = panRef.current) {
    const value = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const next = value <= MIN_SCALE + 0.01 ? { x: 0, y: 0 } : clampPan(value, nextPan);
    const same =
      Math.abs(value - scaleRef.current) < 0.001 &&
      Math.abs(next.x - panRef.current.x) < 0.5 &&
      Math.abs(next.y - panRef.current.y) < 0.5;
    scaleRef.current = value;
    panRef.current = next;
    if (!same) {
      setScale(value);
      setPan(next);
    }
  }

  function toggleZoom() {
    const now = Date.now();
    if (now - lastToggle.current < 320) return;
    lastToggle.current = now;
    const fill = fitRef.current.fill || 1;
    const closer = Math.min(MAX_SCALE, Math.max(fill + 1, fill * 1.8));
    if (scaleRef.current > fill + 0.25) commit(fill, { x: 0, y: 0 });
    else commit(closer);
  }

  function markGesture() {
    suppressClose.current = true;
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClose.current = false;
    }, 500);
  }

  function measure() {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || !img.naturalWidth || !img.naturalHeight) return;
    const viewW = stage.clientWidth;
    const viewH = stage.clientHeight;
    if (viewW < 2 || viewH < 2) return;
    const fitScale = Math.min(viewW / img.naturalWidth, viewH / img.naturalHeight);
    const fillScale = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
    const nextFit = {
      w: img.naturalWidth * fitScale,
      h: img.naturalHeight * fitScale,
      fill: fitScale > 0 ? fillScale / fitScale : 1,
    };
    const previousFill = fitRef.current.fill || nextFit.fill;
    const ratio = scaleRef.current / previousFill;
    viewRef.current = { w: viewW, h: viewH };
    fitRef.current = nextFit;
    setFit(nextFit);
    setReady(true);
    commit(nextFit.fill * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1), panRef.current);
  }

  useEffect(() => {
    const viewer = viewerRef.current;
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!viewer || !stage) return;
    document.body.classList.add("photo-open");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const stopGesture = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", stopGesture);
    document.addEventListener("gesturechange", stopGesture);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
        markGesture();
      }
      moved.current = false;
      if (event.touches.length >= 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        pinchRef.current = {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          scale: scaleRef.current,
        };
        dragRef.current = null;
        return;
      }
      pinchRef.current = null;
      const touch = event.touches[0];
      if (touch && scaleRef.current > 1) {
        dragRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!viewer.contains(event.target as Node) && event.touches.length < 2) return;
      event.preventDefault();
      if (event.touches.length >= 2 && pinchRef.current) {
        markGesture();
        const [a, b] = [event.touches[0], event.touches[1]];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        commit(pinchRef.current.scale * (distance / pinchRef.current.distance));
        return;
      }
      const touch = event.touches[0];
      if (touch && dragRef.current && scaleRef.current > 1) {
        const dx = touch.clientX - dragRef.current.x;
        const dy = touch.clientY - dragRef.current.y;
        if (Math.hypot(dx, dy) > 8) {
          moved.current = true;
          markGesture();
        }
        commit(scaleRef.current, { x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        pinchRef.current = {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          scale: scaleRef.current,
        };
        return;
      }
      pinchRef.current = null;
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        dragRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
        return;
      }
      dragRef.current = null;
      if (!moved.current && event.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) toggleZoom();
        lastTap.current = now;
      }
      moved.current = false;
    };

    viewer.addEventListener("touchstart", onTouchStart, { passive: false });
    viewer.addEventListener("touchmove", onTouchMove, { passive: false });
    viewer.addEventListener("touchend", onTouchEnd);
    viewer.addEventListener("touchcancel", onTouchEnd);
    const onLoad = () => measure();
    img?.addEventListener("load", onLoad);
    const observer = new ResizeObserver(() => measure());
    observer.observe(stage);
    measure();
    return () => {
      document.body.classList.remove("photo-open");
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("gesturestart", stopGesture);
      document.removeEventListener("gesturechange", stopGesture);
      viewer.removeEventListener("touchstart", onTouchStart);
      viewer.removeEventListener("touchmove", onTouchMove);
      viewer.removeEventListener("touchend", onTouchEnd);
      viewer.removeEventListener("touchcancel", onTouchEnd);
      img?.removeEventListener("load", onLoad);
      observer.disconnect();
      window.clearTimeout(suppressTimer.current);
    };
    // Gesture helpers close over the latest commit via the render that mounted the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A synthetic pointer in a test has no active id. */
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: scaleRef.current };
      dragRef.current = null;
      return;
    }
    if (scaleRef.current > 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      commit(pinchRef.current.scale * (distance / pinchRef.current.distance));
      return;
    }
    if (dragRef.current && scaleRef.current > 1) {
      commit(scaleRef.current, {
        x: dragRef.current.panX + (event.clientX - dragRef.current.x),
        y: dragRef.current.panY + (event.clientY - dragRef.current.y),
      });
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) dragRef.current = null;
  }

  return (
    <div ref={viewerRef} className="photo-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="photo-bar">
        <BigButton
          className="photo-close"
          label={t.closePhoto}
          alt={other.closePhoto}
          onClick={() => {
            if (suppressClose.current) {
              suppressClose.current = false;
              return;
            }
            onClose();
          }}
        />
      </div>
      <div
        className="photo-stage"
        ref={stageRef}
        data-ready={ready ? "true" : "false"}
        data-scale={scale.toFixed(2)}
        data-fill={fit.fill.toFixed(2)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => toggleZoom()}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          className={ready ? "is-ready" : ""}
          style={{
            width: fit.w ? `${fit.w}px` : undefined,
            height: fit.h ? `${fit.h}px` : undefined,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
          }}
        />
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`photo-launch ${className ?? ""}`} aria-label={t.lookCloser} onClick={() => setOpen(true)}>
        <img src={src} alt={alt} data-testid={testId} />
      </button>
      {open ? <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
