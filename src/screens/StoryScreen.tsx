import { useEffect, useRef, useState } from "react";
import { choiceLabel, materialChoices, stepLabel, themeChoices } from "../i18n";
import { removeVoice, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { dollTitle, type VoiceNote } from "../types";
import { useRemoveDoll } from "../undo";
import { BigButton, Dialog, Screen, StatusLine, dollKind, useBlobUrl } from "../ui";

function VoiceRow({ voice, autoPlay }: { voice: VoiceNote; autoPlay?: boolean }) {
  const { t, alt } = useI18n();
  const url = useBlobUrl(voice.localKey, voice.driveFileId);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!autoPlay || !url || !ref.current) return;
    ref.current.currentTime = 0;
    void ref.current.play().catch(() => undefined);
  }, [autoPlay, url]);
  return (
    <div className="stack">
      <audio ref={ref} src={url} preload="auto" />
      <BigButton
        className="thumb-action"
        tone="primary"
        label={t.playVoice}
        alt={alt.playVoice}
        onClick={() => {
          if (!ref.current) return;
          ref.current.currentTime = 0;
          void ref.current.play().catch(() => undefined);
        }}
      />
    </div>
  );
}

export function StoryScreen({ id }: { id: string }) {
  const snap = useApp();
  const nav = useNav();
  const removeDoll = useRemoveDoll();
  const { t, alt, lang } = useI18n();
  const doll = snap.catalog.dolls.find((item) => item.id === id);
  const photo = useBlobUrl(doll?.photoLocalKey, doll?.photoDriveId);
  const [confirm, setConfirm] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  if (!doll) return null;
  const name = dollTitle(doll, t.dollFallback);
  const lines = [
    doll.step ? stepLabel(doll.step, lang) : "",
    choiceLabel(themeChoices, doll.theme, lang),
    doll.givenBy ? `${t.givenBy}: ${doll.givenBy}` : "",
    doll.givenWhen ? `${t.givenWhen}: ${doll.givenWhen}` : "",
    doll.yearJoined ? `${t.yearJoined}: ${doll.yearJoined}` : "",
    choiceLabel(materialChoices, doll.material, lang),
    doll.condition === "good" ? t.good : doll.condition === "repair" ? t.repair : "",
    doll.storageBox ? `${t.storage}: ${doll.storageBox}` : "",
  ].filter(Boolean);

  const firstVoice = doll.voiceNotes[0];
  return (
    <Screen
      title={name}
      onBack={nav.back}
      dock={firstVoice ? <VoiceRow voice={firstVoice} autoPlay /> : <BigButton className="thumb-action" tone="primary" label={t.edit} alt={alt.edit} onClick={() => nav.go({ name: "doll", id })} />}
    >
      <StatusLine kind={dollKind(doll.id, snap)} />
      {photo ? <img className="hero" src={photo} alt={name} /> : <div className="hero placeholder">{name}</div>}
      {doll.voiceNotes.slice(1).map((voice) => (
        <VoiceRow key={voice.id} voice={voice} />
      ))}
      {doll.notes.trim() ? <p className="notes">{doll.notes}</p> : null}
      {lines.map((line) => (
        <p key={line} className="detail">{line}</p>
      ))}
      {firstVoice ? <BigButton tone="primary" label={t.edit} alt={alt.edit} onClick={() => nav.go({ name: "doll", id })} /> : null}
      {doll.voiceNotes.map((voice) => (
        <BigButton key={voice.id} label={t.removeVoice} alt={alt.removeVoice} onClick={() => setVoiceId(voice.id)} />
      ))}
      <BigButton tone="danger" label={t.deleteDoll} alt={alt.deleteDoll} onClick={() => setConfirm(true)} />
      {confirm ? (
        <Dialog
          title={t.removeConfirm}
          body={t.removeBody}
          yesLabel={t.removeYes}
          yesAlt={alt.removeYes}
          noLabel={t.removeNo}
          noAlt={alt.removeNo}
          danger
          onNo={() => setConfirm(false)}
          onYes={() => {
            setConfirm(false);
            removeDoll(doll);
            nav.back();
          }}
        />
      ) : null}
      {voiceId ? (
        <Dialog
          title={t.removeVoice}
          body={t.removeBody}
          yesLabel={t.removeVoiceYes}
          noLabel={t.removeNo}
          noAlt={alt.removeNo}
          danger
          onNo={() => setVoiceId(null)}
          onYes={() => {
            void removeVoice(id, voiceId);
            setVoiceId(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
