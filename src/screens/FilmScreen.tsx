import { useEffect, useMemo, useRef, useState } from "react";
import { renderFilm } from "../lib/film";
import { defaultOrder, planSlides } from "../lib/filmPlan";
import type { MusicLevel } from "../lib/musicMix";
import { MUSIC_TRACKS, musicFileUrl, type MusicTrackId } from "../lib/tracks";
import { setLastFilm } from "../lib/filmSession";
import { blobGet } from "../lib/idb";
import { blobToImage } from "../lib/photos";
import { saveFilm, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { dollTitle, isBlank } from "../types";
import { BigButton, Screen, useBlobUrl } from "../ui";

const SIZES = {
  "720": { width: 1280, height: 720, bitrate: 2_500_000 },
  "1080": { width: 1920, height: 1080, bitrate: 5_000_000 },
} as const;

function RowThumb({ id }: { id: string }) {
  const snap = useApp();
  const doll = snap.catalog.dolls.find((item) => item.id === id);
  const url = useBlobUrl(doll?.photoLocalKey, doll?.photoDriveId);
  return url ? <img src={url} alt="" /> : <span className="thumb-fallback" aria-hidden="true" />;
}

export function FilmScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, alt, lang } = useI18n();
  const dolls = snap.catalog.dolls.filter((doll) => !isBlank(doll));
  const [order, setOrder] = useState<string[]>(() => defaultOrder(dolls));
  const [include, setInclude] = useState<string[]>(() => dolls.map((doll) => doll.id));
  const [titleOn, setTitleOn] = useState(true);
  const [closingOn, setClosingOn] = useState(true);
  const [title, setTitle] = useState(`Ma Bommala Koluvu ${new Date().getFullYear()}`);
  const [closing, setClosing] = useState(lang === "te" ? "ఇంతే" : "The end");
  const [size, setSize] = useState<keyof typeof SIZES>("720");
  const [musicChoice, setMusicChoice] = useState<"none" | MusicTrackId | "own">("none");
  const [musicLevel, setMusicLevel] = useState<MusicLevel>("soft");
  const [ownBlob, setOwnBlob] = useState<Blob | null>(null);
  const [ownUrl, setOwnUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [savedId, setSavedId] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const lock = useRef(false);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const plans = useMemo(() => dolls.map((doll) => ({
    id: doll.id,
    step: doll.step,
    order: doll.order,
    voiceMs: doll.voiceNotes[0]?.durationMs ?? null,
  })), [dolls]);

  function move(id: string, dir: -1 | 1) {
    setOrder((prev) => {
      const index = prev.indexOf(id);
      const nextIndex = index + dir;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item!);
      return copy;
    });
  }

  function stopPreview() {
    previewRef.current?.pause();
    setPlaying(false);
  }

  function chooseOwn(file: File | undefined) {
    if (!file) return;
    if (ownUrl) URL.revokeObjectURL(ownUrl);
    const url = URL.createObjectURL(file);
    setOwnBlob(file);
    setOwnUrl(url);
    setMusicChoice("own");
    stopPreview();
  }

  async function togglePreview() {
    const audio = previewRef.current;
    if (!audio) return;
    if (playing) {
      stopPreview();
      return;
    }
    const url = musicChoice === "own"
      ? ownUrl
      : MUSIC_TRACKS.find((track) => track.id === musicChoice)
        ? musicFileUrl(MUSIC_TRACKS.find((track) => track.id === musicChoice)!.file)
        : "";
    if (!url) return;
    audio.src = url;
    audio.loop = true;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  async function make() {
    if (lock.current) return;
    stopPreview();
    const slides = planSlides({
      dolls: plans,
      orderIds: order,
      includeIds: include,
      title: titleOn,
      closing: closingOn,
    });
    if (!slides.some((slide) => slide.kind === "doll")) {
      setError(t.pickOne);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    lock.current = true;
    setError("");
    setRendering(true);
    setProgress(0);
    try {
      const images = new Map<string, HTMLImageElement>();
      const names = new Map<string, string>();
      const voices = new Map<string, Blob>();
      for (const id of include) {
        const doll = dolls.find((item) => item.id === id);
        if (!doll) continue;
        names.set(id, dollTitle(doll, t.dollFallback));
        if (doll.photoLocalKey) {
          const record = await blobGet(doll.photoLocalKey);
          if (record) {
            try {
              images.set(id, await blobToImage(record.blob));
            } catch {
              /* slide still shows the name */
            }
          }
        } else if (doll.photoDriveId) {
          const record = await blobGet(`drive:${doll.photoDriveId}`);
          if (record) {
            try {
              images.set(id, await blobToImage(record.blob));
            } catch {
              /* ignore */
            }
          }
        }
        const voice = doll.voiceNotes[0];
        if (voice?.localKey) {
          const record = await blobGet(voice.localKey);
          if (record) voices.set(id, record.blob);
        } else if (voice?.driveFileId) {
          const record = await blobGet(`drive:${voice.driveFileId}`);
          if (record) voices.set(id, record.blob);
        }
      }
      let music: Blob | null = null;
      if (musicChoice === "own") music = ownBlob;
      else if (musicChoice !== "none") {
        const track = MUSIC_TRACKS.find((item) => item.id === musicChoice);
        if (track) {
          const response = await fetch(musicFileUrl(track.file));
          if (response.ok) music = await response.blob();
        }
      }
      const chosen = SIZES[size];
      const result = await renderFilm({
        canvas,
        slides,
        title,
        closing,
        names,
        images,
        voices,
        music,
        musicLevel,
        width: chosen.width,
        height: chosen.height,
        bitrate: chosen.bitrate,
        onProgress: setProgress,
      });
      setLastFilm({ blob: result.blob, mimeType: result.mimeType, ext: result.ext, title });
      const url = URL.createObjectURL(result.blob);
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const id = await saveFilm(result.blob, result.mimeType, title);
      setSavedId(id);
    } catch {
      setError(t.filmError);
    } finally {
      setRendering(false);
      lock.current = false;
    }
  }

  const saved = snap.catalog.films.find((item) => item.id === savedId);
  const waiting = Boolean(saved && snap.mode === "google" && snap.sync.dirtyFilmIds.includes(saved.id));

  const filmDock = rendering ? (
    <>
      <p>{t.making} {Math.round(progress * 100)}%</p>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t.making}>
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </>
  ) : videoUrl ? (
    <BigButton className="thumb-action" tone="primary" label={t.uploadYouTube} alt={alt.uploadYouTube} onClick={() => nav.go({ name: "youtube" })} />
  ) : dolls.length > 0 ? (
    <BigButton className="thumb-action" tone="primary" label={t.makeTheFilm} alt={alt.makeTheFilm} onClick={() => void make()} />
  ) : null;

  return (
    <Screen title={t.makeFilm} onBack={nav.back} className={videoUrl ? "dock-roomy" : ""} dock={filmDock}>
      {dolls.length === 0 ? <p>{t.nothingToFilm}</p> : null}
      <p>{t.filmIntro}</p>
      <h2>{t.music}</h2>
      <BigButton label={t.musicNone} alt={alt.musicNone} aria-pressed={musicChoice === "none"} onClick={() => { setMusicChoice("none"); stopPreview(); }} />
      {MUSIC_TRACKS.map((track) => {
        const label = track.id === "drone" ? t.trackDrone : track.id === "flute" ? t.trackFlute : track.id === "veena" ? t.trackVeena : t.trackDrums;
        const other = track.id === "drone" ? alt.trackDrone : track.id === "flute" ? alt.trackFlute : track.id === "veena" ? alt.trackVeena : alt.trackDrums;
        return (
          <BigButton
            key={track.id}
            label={label}
            alt={other}
            aria-pressed={musicChoice === track.id}
            onClick={() => { setMusicChoice(track.id); stopPreview(); }}
          />
        );
      })}
      <input ref={ownInputRef} type="file" accept="audio/*" hidden onChange={(event) => chooseOwn(event.target.files?.[0])} />
      <BigButton label={t.musicOwn} alt={alt.musicOwn} aria-pressed={musicChoice === "own"} onClick={() => ownInputRef.current?.click()} />
      {musicChoice === "own" && ownBlob ? <p className="status ok">{t.musicReady}</p> : null}
      {musicChoice !== "none" ? (
        <>
          <BigButton tone="primary" label={playing ? t.musicStopHear : t.musicHear} alt={playing ? alt.musicStopHear : alt.musicHear} onClick={() => void togglePreview()} />
          <h2>{t.musicVolume}</h2>
          <div className="row">
            <BigButton label={t.musicSoft} alt={alt.musicSoft} aria-pressed={musicLevel === "soft"} onClick={() => setMusicLevel("soft")} />
            <BigButton label={t.musicMedium} alt={alt.musicMedium} aria-pressed={musicLevel === "medium"} onClick={() => setMusicLevel("medium")} />
          </div>
        </>
      ) : null}
      <audio ref={previewRef} onEnded={() => setPlaying(false)} />
      <h2>{t.resolution}</h2>
      <div className="row">
        <BigButton label={t.smaller} alt={alt.smaller} aria-pressed={size === "720"} onClick={() => setSize("720")} />
        <BigButton label={t.sharper} alt={alt.sharper} aria-pressed={size === "1080"} onClick={() => setSize("1080")} />
      </div>
      <BigButton label={t.showTitle} alt={alt.showTitle} aria-pressed={titleOn} onClick={() => setTitleOn((value) => !value)} />
      {titleOn ? (
        <label className="field">
          <span className="field-label">{t.titleLabel}</span>
          <input aria-label={t.titleLabel} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      ) : null}
      <BigButton label={t.showClosing} alt={alt.showClosing} aria-pressed={closingOn} onClick={() => setClosingOn((value) => !value)} />
      {closingOn ? (
        <label className="field">
          <span className="field-label">{t.closingLabel}</span>
          <input aria-label={t.closingLabel} value={closing} onChange={(event) => setClosing(event.target.value)} />
        </label>
      ) : null}
      <div className="stack">
        {order.map((id) => {
          const doll = dolls.find((item) => item.id === id);
          if (!doll) return null;
          const name = dollTitle(doll, t.dollFallback);
          const on = include.includes(id);
          return (
            <section key={id} className="film-row">
              <div className="film-id">
                <RowThumb id={id} />
                <strong>{name}</strong>
              </div>
              <BigButton
                label={on ? t.inFilm : t.leaveOut}
                alt={on ? alt.inFilm : alt.leaveOut}
                aria-pressed={on}
                onClick={() => setInclude((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))}
              />
              <div className="row">
                <BigButton label={t.moveUp} alt={alt.moveUp} aria-label={`${t.moveUp} ${name}`} onClick={() => move(id, -1)} />
                <BigButton label={t.moveDown} alt={alt.moveDown} aria-label={`${t.moveDown} ${name}`} onClick={() => move(id, 1)} />
              </div>
            </section>
          );
        })}
      </div>
      <canvas ref={canvasRef} className={rendering ? "film-canvas" : "film-canvas hidden-canvas"} />
      {error ? <p className="status wait">{error}</p> : null}
      {videoUrl ? (
        <div className="stack">
          <video ref={videoRef} data-testid="film-preview" className="film-canvas" src={videoUrl} playsInline controls />
          <BigButton tone="primary" label={t.playFilm} alt={alt.playFilm} onClick={() => void videoRef.current?.play()} />
          <BigButton label={t.download} alt={alt.download} onClick={() => download(videoUrl, title)} />
          <p className="status ok" role="status">{waiting ? t.waiting : snap.mode === "demo" ? t.savedDevice : t.savedDrive}</p>
        </div>
      ) : null}
      {snap.catalog.films.length ? <h2>{t.filmsSaved}</h2> : null}
      {snap.catalog.films.map((film) => (
        <p key={film.id}>{film.title}</p>
      ))}
    </Screen>
  );
}

function download(url: string, title: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title || "Ma-Bommala-Koluvu"}.video`;
  anchor.click();
}
