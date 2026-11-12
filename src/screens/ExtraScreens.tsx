import { useRef, useState } from "react";
import { compressPhoto } from "../lib/photos";
import { setYearPhoto, shareWithEmail, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { dollTitle, isBlank } from "../types";
import { ZoomablePhoto } from "../PhotoZoom";
import { BigButton, Dialog, Field, Screen, useBlobUrl } from "../ui";

function YearPhoto({ id }: { id: string }) {
  const snap = useApp();
  const shot = snap.catalog.years.find((item) => item.id === id);
  const url = useBlobUrl(shot?.localKey, shot?.driveFileId);
  if (!shot) return null;
  return url ? <ZoomablePhoto className="hero" src={url} alt={String(shot.year)} /> : null;
}

export function YearScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, alt } = useI18n();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const current = new Date().getFullYear();
  const [pickYear, setPickYear] = useState(current);
  const shot = snap.catalog.years.find((item) => item.year === pickYear);
  const older = [...snap.catalog.years].filter((item) => item.year !== pickYear).sort((a, b) => b.year - a.year);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const blob = await compressPhoto(file);
    await setYearPhoto(pickYear, blob);
  }

  return (
    <Screen title={t.years} onBack={nav.back}>
      <p>{t.yearsHelp}</p>
      <h2>{t.thisYear}</h2>
      <div className="stack">
        {[current, current - 1, current - 2].map((year) => (
          <BigButton key={year} label={String(year)} aria-pressed={pickYear === year} onClick={() => setPickYear(year)} />
        ))}
      </div>
      <YearPhoto id={shot?.id ?? ""} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void onFile(event.target.files?.[0])} />
      <BigButton tone="primary" label={shot ? t.replaceYearPhoto : t.addYearPhoto} alt={shot ? alt.replaceYearPhoto : alt.addYearPhoto} onClick={() => fileRef.current?.click()} />
      {older.length ? <h2>{t.olderYears}</h2> : null}
      {older.map((item) => (
        <BigButton key={item.id} label={String(item.year)} onClick={() => setPickYear(item.year)} />
      ))}
    </Screen>
  );
}

export function PackingScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t } = useI18n();
  const groups = new Map<string, { id: string; name: string; step: number | null }[]>();
  for (const doll of snap.catalog.dolls.filter((item) => !isBlank(item))) {
    const key = doll.storageBox.trim();
    const row = { id: doll.id, name: dollTitle(doll, t.dollFallback), step: doll.step };
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
  return (
    <Screen title={t.packingTitle} onBack={nav.back}>
      <p>{t.packingHelp}</p>
      {keys.map((key) => (
        <section key={key || "none"}>
          <h2>{key || t.noBox}</h2>
          {(groups.get(key) ?? []).map((row) => (
            <BigButton key={row.id} label={`${row.name}${row.step ? ` · ${row.step}` : ""}`} onClick={() => nav.go({ name: "story", id: row.id })} />
          ))}
        </section>
      ))}
    </Screen>
  );
}

export function ShareScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, alt } = useI18n();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setMessage("");
    try {
      await shareWithEmail(email.trim());
      setMessage(t.sharedOk);
      setConfirm(false);
    } catch {
      setMessage(snap.mode === "google" ? t.shareFailed : t.shareNeedsGoogle);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t.share} onBack={nav.back}>
      <p>{snap.mode === "google" ? t.shareHelp : t.shareNeedsGoogle}</p>
      {snap.mode === "google" ? (
        <>
          <Field label={t.email} alt={alt.email}>
            <input aria-label={t.email} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <BigButton tone="primary" label={t.share} alt={alt.share} disabled={busy || !email.includes("@")} onClick={() => setConfirm(true)} />
        </>
      ) : null}
      {message ? <p className="status ok" role="status">{message}</p> : null}
      {confirm ? (
        <Dialog
          title={t.shareConfirm}
          body={`${email}. ${t.shareConfirmBody}`}
          yesLabel={t.shareYes}
          yesAlt={alt.shareYes}
          noLabel={t.shareNo}
          noAlt={alt.shareNo}
          onNo={() => setConfirm(false)}
          onYes={() => void share()}
        />
      ) : null}
    </Screen>
  );
}
