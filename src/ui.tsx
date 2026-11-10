import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { blobGet } from "./lib/idb";
import { useApp, type Snapshot } from "./lib/repository";
import { useI18n } from "./text";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  alt?: string;
  tone?: "primary" | "green" | "quiet" | "danger";
};

export function BigButton({ label, alt, tone = "quiet", className, ...rest }: ButtonProps) {
  const named = rest["aria-label"];
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      data-tap="primary"
      aria-label={typeof named === "string" ? named : label}
      className={`big tone-${tone} ${className ?? ""}`}
    >
      <span className="label">{label}</span>
      {alt ? (
        <span className="alt" aria-hidden="true">
          {alt}
        </span>
      ) : null}
    </button>
  );
}

export function Screen({
  title,
  children,
  onBack,
  className,
}: {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  className?: string;
}) {
  const { t, alt } = useI18n();
  return (
    <main className={`screen ${className ?? ""}`}>
      <header className="topbar">
        {onBack ? <BigButton label={t.back} alt={alt.back} onClick={onBack} /> : null}
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function Field({
  label,
  alt,
  children,
}: {
  label: string;
  alt?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {alt ? (
        <span className="alt" aria-hidden="true">
          {alt}
        </span>
      ) : null}
      {children}
    </label>
  );
}

export function StatusLine({ kind }: { kind: "device" | "waiting" | "saved" }) {
  const { t } = useI18n();
  const text = kind === "device" ? t.savedDevice : kind === "waiting" ? t.waiting : t.savedDrive;
  return (
    <p className={`status ${kind === "saved" || kind === "device" ? "ok" : "wait"}`} role="status">
      {text}
    </p>
  );
}

export function dollKind(dollId: string, snap: Snapshot): "device" | "waiting" | "saved" {
  if (snap.mode !== "google") return "device";
  return snap.sync.dirtyDollIds.includes(dollId) ? "waiting" : "saved";
}

export function libraryKind(snap: Snapshot): "device" | "waiting" | "saved" {
  if (snap.mode !== "google") return "device";
  const dirty = snap.sync.dirtyDollIds.length + snap.sync.dirtyYearIds.length + snap.sync.dirtyFilmIds.length;
  if (dirty > 0 || snap.phase === "syncing" || snap.phase === "offline" || snap.phase === "error") return "waiting";
  return "saved";
}

export function useBlobUrl(localKey?: string, driveId?: string): string | undefined {
  const epoch = useApp().blobEpoch;
  const key = localKey || (driveId ? `drive:${driveId}` : "");
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!key) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    let current: string | undefined;
    void blobGet(key).then((record) => {
      if (cancelled || !record) return;
      current = URL.createObjectURL(record.blob);
      setUrl(current);
    });
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [key, epoch]);
  return url;
}

export function Dialog({
  title,
  body,
  yesLabel,
  yesAlt,
  noLabel,
  noAlt,
  danger,
  onYes,
  onNo,
}: {
  title: string;
  body: string;
  yesLabel: string;
  yesAlt?: string;
  noLabel: string;
  noAlt?: string;
  danger?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h2>{title}</h2>
        <p>{body}</p>
        <BigButton tone={danger ? "danger" : "primary"} label={yesLabel} alt={yesAlt} onClick={onYes} />
        <BigButton label={noLabel} alt={noAlt} onClick={onNo} />
      </div>
    </div>
  );
}
