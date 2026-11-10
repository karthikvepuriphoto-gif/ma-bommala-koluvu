import { useEffect, useRef, useState } from "react";
import { materialChoices, themeChoices, type Choice } from "../i18n";
import { pickAudioMime } from "../lib/audio";
import { compressPhoto } from "../lib/photos";
import { addVoice, discardIfBlank, patchDoll, setDollPhoto, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { BigButton, Field, Screen, StatusLine, dollKind, useBlobUrl } from "../ui";
import { stepLabel } from "../i18n";

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useAutosave(id: string, key: "name" | "notes" | "givenBy" | "givenWhen" | "storageBox" | "theme" | "material", value: string, current: string | undefined) {
  useEffect(() => {
    if (current === undefined || value === current) return;
    const handle = window.setTimeout(() => {
      void patchDoll(id, { [key]: value });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [id, key, value, current]);
}

export function DollScreen({ id }: { id: string }) {
  const snap = useApp();
  const nav = useNav();
  const { t, alt, lang } = useI18n();
  const doll = snap.catalog.dolls.find((item) => item.id === id);
  const photoUrl = useBlobUrl(doll?.photoLocalKey, doll?.photoDriveId);
  const [name, setName] = useState(doll?.name ?? "");
  const [notes, setNotes] = useState(doll?.notes ?? "");
  const [givenBy, setGivenBy] = useState(doll?.givenBy ?? "");
  const [givenWhen, setGivenWhen] = useState(doll?.givenWhen ?? "");
  const [storageBox, setStorageBox] = useState(doll?.storageBox ?? "");
  const [customTheme, setCustomTheme] = useState(doll && !themeChoices.some((item) => item.id === doll.theme) ? doll.theme : "");
  const [customMaterial, setCustomMaterial] = useState(doll && !materialChoices.some((item) => item.id === doll.material) ? doll.material : "");
  const [more, setMore] = useState(Boolean(doll && (doll.theme || doll.givenBy || doll.givenWhen || doll.yearJoined || doll.material || doll.condition || doll.storageBox)));
  const [phase, setPhase] = useState<"idle" | "recording" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [review, setReview] = useState<{ blob: Blob; url: string; mime: string; durationMs: number } | null>(null);
  const [micError, setMicError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const left = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  useAutosave(id, "name", name, doll?.name);
  useAutosave(id, "notes", notes, doll?.notes);
  useAutosave(id, "givenBy", givenBy, doll?.givenBy);
  useAutosave(id, "givenWhen", givenWhen, doll?.givenWhen);
  useAutosave(id, "storageBox", storageBox, doll?.storageBox);
  const themeTimer = useRef<number | null>(null);
  const materialTimer = useRef<number | null>(null);
  const draft = useRef({ name, notes, givenBy, givenWhen, storageBox });
  draft.current = { name, notes, givenBy, givenWhen, storageBox };

  function queueText(kind: "theme" | "material", value: string) {
    const timer = kind === "theme" ? themeTimer : materialTimer;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void patchDoll(id, { [kind]: value });
    }, 400);
  }

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "review" || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => undefined);
  }, [phase, review?.url]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressPhoto(file);
      await setDollPhoto(id, blob);
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    setMicError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        if (left.current) return;
        const type = mime || recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const url = URL.createObjectURL(blob);
        setReview({ blob, url, mime: type, durationMs: Math.max(400, Date.now() - started) });
        setPhase("review");
        navigator.vibrate?.(40);
      });
      recorderRef.current = recorder;
      recorder.start(200);
      setPhase("recording");
      setElapsed(0);
    } catch {
      setMicError(true);
      setPhase("idle");
    }
  }

  function stopRec() {
    if (recorderRef.current && recorderRef.current.state === "recording") recorderRef.current.stop();
  }

  async function keep() {
    if (!review) return;
    await addVoice(id, review.blob, review.mime, review.durationMs);
    URL.revokeObjectURL(review.url);
    setReview(null);
    setPhase("idle");
    setKept(true);
  }

  function again() {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
    setPhase("idle");
    void startRec();
  }

  async function leave() {
    left.current = true;
    if (themeTimer.current) window.clearTimeout(themeTimer.current);
    if (materialTimer.current) window.clearTimeout(materialTimer.current);
    if (recorderRef.current && recorderRef.current.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (review) URL.revokeObjectURL(review.url);
    const extra: { theme?: string; material?: string } = {};
    if (customTheme) extra.theme = customTheme;
    if (customMaterial) extra.material = customMaterial;
    await patchDoll(id, { ...draft.current, ...extra });
    await discardIfBlank(id);
    nav.back();
  }

  if (!doll) return null;
  const years: string[] = [];
  const thisYear = new Date().getFullYear();
  for (let year = thisYear; year >= 1970; year -= 1) years.push(String(year));

  function choiceButtons(list: Choice[], current: string, apply: (value: string) => void) {
    return (
      <div className="choice-list">
        {list.map((choice) => (
          <BigButton
            key={choice.id}
            label={choice[lang]}
            alt={choice[lang === "te" ? "en" : "te"]}
            aria-pressed={current === choice.id}
            onClick={() => apply(current === choice.id ? "" : choice.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <Screen title={doll.name.trim() || t.newDoll} onBack={() => void leave()} className={phase === "idle" ? "" : "pad-dock"}>
      <StatusLine kind={dollKind(doll.id, snap)} />
      <p className="hint">{t.autosave}</p>
      {photoUrl ? <img className="hero" data-testid="photo-preview" src={photoUrl} alt={doll.name || t.dollFallback} /> : null}
      {busy ? <p>{t.preparingPhoto}</p> : null}
      <input
        ref={cameraRef}
        data-testid="camera-file"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => void onPhoto(event.target.files?.[0])}
      />
      <input
        ref={fileRef}
        data-testid="photo-file"
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void onPhoto(event.target.files?.[0])}
      />
      <BigButton label={t.takePhoto} alt={alt.takePhoto} onClick={() => cameraRef.current?.click()} />
      <BigButton label={t.choosePhoto} alt={alt.choosePhoto} onClick={() => fileRef.current?.click()} />
      <Field label={t.name} alt={alt.name}>
        <input aria-label={t.name} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
      </Field>
      <h2>{t.whichStep}</h2>
      <div className="step-grid">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((step) => (
          <BigButton
            key={step}
            label={String(step)}
            aria-label={stepLabel(step, lang)}
            aria-pressed={doll.step === step}
            onClick={() => void patchDoll(id, { step })}
          />
        ))}
        <BigButton className="span-3" label={t.notSure} alt={alt.notSure} aria-pressed={doll.step == null} onClick={() => void patchDoll(id, { step: null })} />
      </div>
      {phase === "idle" ? <BigButton tone="primary" label={t.record} alt={alt.record} onClick={() => void startRec()} /> : null}
      {micError ? <p className="status wait">{t.micError}</p> : null}
      {kept ? <p className="status ok">{t.voiceKept}</p> : null}
      {(doll.voiceNotes.length > 0 && phase === "idle") ? (
        <p className="hint">{t.voiceKept}: {doll.voiceNotes.length}</p>
      ) : null}
      {phase === "idle" && doll.voiceNotes.length > 0 ? (
        <BigButton label={t.addAnotherVoice} alt={alt.addAnotherVoice} onClick={() => void startRec()} />
      ) : null}
      <Field label={t.notes} alt={alt.notes}>
        <textarea aria-label={t.notes} value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} lang={lang === "te" ? "te" : "en"} />
      </Field>
      <p className="hint">{t.dictateHint}</p>
      <BigButton label={more ? t.hideDetails : t.moreDetails} alt={more ? alt.hideDetails : alt.moreDetails} aria-expanded={more} onClick={() => setMore((value) => !value)} />
      {more ? (
        <div className="stack">
          <h2>{t.theme}</h2>
          {choiceButtons(themeChoices, doll.theme, (value) => {
            if (themeTimer.current) window.clearTimeout(themeTimer.current);
            setCustomTheme("");
            void patchDoll(id, { theme: value });
          })}
          <Field label={t.themeCustom} alt={alt.themeCustom}>
            <input
              aria-label={t.themeCustom}
              value={customTheme}
              onChange={(event) => {
                setCustomTheme(event.target.value);
                queueText("theme", event.target.value);
              }}
              autoComplete="off"
            />
          </Field>
          <Field label={t.givenBy} alt={alt.givenBy}>
            <input aria-label={t.givenBy} value={givenBy} onChange={(event) => setGivenBy(event.target.value)} autoComplete="off" />
          </Field>
          <Field label={t.givenWhen} alt={alt.givenWhen}>
            <input aria-label={t.givenWhen} value={givenWhen} onChange={(event) => setGivenWhen(event.target.value)} autoComplete="off" />
          </Field>
          <Field label={t.yearJoined} alt={alt.yearJoined}>
            <select
              aria-label={t.yearJoined}
              value={doll.yearJoined}
              onChange={(event) => void patchDoll(id, { yearJoined: event.target.value })}
            >
              <option value="">{t.notSure}</option>
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </Field>
          <h2>{t.material}</h2>
          {choiceButtons(materialChoices, doll.material, (value) => {
            if (materialTimer.current) window.clearTimeout(materialTimer.current);
            setCustomMaterial("");
            void patchDoll(id, { material: value });
          })}
          <Field label={t.materialCustom} alt={alt.materialCustom}>
            <input
              aria-label={t.materialCustom}
              value={customMaterial}
              onChange={(event) => {
                setCustomMaterial(event.target.value);
                queueText("material", event.target.value);
              }}
              autoComplete="off"
            />
          </Field>
          <h2>{t.condition}</h2>
          <div className="row">
            <BigButton label={t.good} alt={alt.good} aria-pressed={doll.condition === "good"} onClick={() => void patchDoll(id, { condition: doll.condition === "good" ? "" : "good" })} />
            <BigButton label={t.repair} alt={alt.repair} aria-pressed={doll.condition === "repair"} onClick={() => void patchDoll(id, { condition: doll.condition === "repair" ? "" : "repair" })} />
          </div>
          <Field label={t.storage} alt={alt.storage}>
            <input aria-label={t.storage} value={storageBox} placeholder={t.storageHint} onChange={(event) => setStorageBox(event.target.value)} autoComplete="off" />
          </Field>
        </div>
      ) : null}
      {phase === "recording" ? (
        <div className="dock">
          <div className="dock-inner">
            <p className="timer">{t.recording} {clock(elapsed)}</p>
            <BigButton tone="danger" label={t.stop} alt={alt.stop} onClick={stopRec} />
          </div>
        </div>
      ) : null}
      {phase === "review" && review ? (
        <div className="dock">
          <div className="dock-inner">
            <p>{t.listenThen}</p>
            <audio ref={audioRef} src={review.url} />
            <BigButton tone="green" label={t.keep} alt={alt.keep} onClick={() => void keep()} />
            <BigButton label={t.recordAgain} alt={alt.recordAgain} onClick={again} />
          </div>
        </div>
      ) : null}
    </Screen>
  );
}
