import { useState } from "react";
import { ensureYouTubeToken } from "../lib/auth";
import { isAuthError } from "../lib/errors";
import { getLastFilm } from "../lib/filmSession";
import { markAuthProblem, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { uploadYouTubeVideo, type AllowedPrivacy } from "../lib/youtube";
import { BigButton, Screen } from "../ui";

export function YouTubeScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, alt } = useI18n();
  const film = getLastFilm();
  const [privacy, setPrivacy] = useState<AllowedPrivacy>("unlisted");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState("");
  const [resultPrivacy, setResultPrivacy] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function upload() {
    if (!film) return;
    if (snap.mode !== "google") {
      setMessage(t.youtubeNeedsGoogle);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const token = await ensureYouTubeToken();
      const result = await uploadYouTubeVideo({
        token,
        blob: film.blob,
        title: film.title,
        description: `${film.title}. A family film from Ma Bommala Koluvu.`,
        privacy,
        onProgress: setProgress,
      });
      setResultPrivacy(result.privacyStatus);
      setLink(result.id ? `https://www.youtube.com/watch?v=${result.id}` : "");
    } catch (error) {
      if (isAuthError(error)) markAuthProblem();
      else setMessage(t.youtubeFailed);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function send() {
    if (navigator.share) {
      try {
        await navigator.share({ title: film?.title, text: t.onlyLink, url: link });
      } catch {
        /* the person closed the share sheet */
      }
    } else {
      await copy();
    }
  }

  const forcedPrivate = resultPrivacy === "private" && privacy === "unlisted";

  return (
    <Screen title={t.uploadTitle} onBack={nav.back}>
      {!film ? <p>{t.nothingToFilm}</p> : null}
      <p>{t.uploadHelp}</p>
      {!link ? (
        <>
          <BigButton label={t.unlistedChoice} alt={alt.unlistedChoice} aria-pressed={privacy === "unlisted"} onClick={() => setPrivacy("unlisted")} />
          <BigButton label={t.privateChoice} alt={alt.privateChoice} aria-pressed={privacy === "private"} onClick={() => setPrivacy("private")} />
          <BigButton tone="primary" label={t.uploadYes} alt={alt.uploadYes} disabled={busy || !film} onClick={() => void upload()} />
          <BigButton label={t.uploadNo} alt={alt.uploadNo} onClick={nav.back} />
        </>
      ) : null}
      {busy ? (
        <>
          <p>{t.sendingFilm} {Math.round(progress * 100)}%</p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </>
      ) : null}
      {link ? (
        <div className="stack">
          {forcedPrivate ? <p>{t.forcedPrivate}</p> : resultPrivacy === "private" ? <p>{t.privateResult}</p> : <p>{t.onlyLink}</p>}
          <input aria-label={t.copyLink} readOnly value={link} />
          <BigButton tone="primary" label={copied ? t.copied : t.copyLink} alt={alt.copyLink} onClick={() => void copy()} />
          <BigButton label={t.sendLink} alt={alt.sendLink} onClick={() => void send()} />
          <BigButton label={t.uploadYouTube} alt={alt.uploadYouTube} onClick={() => window.open(link, "_blank", "noopener,noreferrer")} />
        </div>
      ) : null}
      {message ? <p className="status wait">{message}</p> : null}
    </Screen>
  );
}
