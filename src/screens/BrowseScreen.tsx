import { useMemo, useState } from "react";
import { choiceLabel, materialChoices, stepLabel, themeChoices } from "../i18n";
import { useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { dollTitle, isBlank } from "../types";
import { ZoomablePhoto } from "../PhotoZoom";
import { Screen, useBlobUrl } from "../ui";

function Thumb({ id }: { id: string }) {
  const snap = useApp();
  const nav = useNav();
  const { t } = useI18n();
  const doll = snap.catalog.dolls.find((item) => item.id === id);
  const url = useBlobUrl(doll?.photoLocalKey, doll?.photoDriveId);
  if (!doll) return null;
  const name = dollTitle(doll, t.dollFallback);
  return (
    <div className="thumb">
      {url ? <ZoomablePhoto className="thumb-photo" src={url} alt={name} /> : <span className="thumb-fallback" aria-hidden="true" />}
      <button type="button" className="thumb-open" data-tap="primary" onClick={() => nav.go({ name: "story", id })}>
        <span>{name}</span>
      </button>
    </div>
  );
}

export function StepsScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, lang } = useI18n();
  const dolls = snap.catalog.dolls.filter((doll) => !isBlank(doll));
  const loose = dolls.filter((doll) => doll.step == null);
  return (
    <Screen title={t.stepsTitle} onBack={nav.back}>
      <ol className="stairs">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((step) => {
          const here = dolls.filter((doll) => doll.step === step);
          return (
            <li key={step}>
              <p>{stepLabel(step, lang)}</p>
              <div className="shelf">
                {here.length === 0 ? <span className="hint">{t.emptyStep}</span> : here.map((doll) => <Thumb key={doll.id} id={doll.id} />)}
              </div>
            </li>
          );
        })}
      </ol>
      {loose.length ? (
        <>
          <h2>{t.noStep}</h2>
          <div className="shelf">{loose.map((doll) => <Thumb key={doll.id} id={doll.id} />)}</div>
        </>
      ) : null}
    </Screen>
  );
}

export function SetsScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, lang } = useI18n();
  const groups = new Map<string, string[]>();
  for (const doll of snap.catalog.dolls.filter((item) => !isBlank(item))) {
    const label = doll.theme ? choiceLabel(themeChoices, doll.theme, lang) : t.noSet;
    groups.set(label, [...(groups.get(label) ?? []), doll.id]);
  }
  return (
    <Screen title={t.setsTitle} onBack={nav.back}>
      {[...groups.entries()].map(([label, ids]) => (
        <section key={label}>
          <h2>{label}</h2>
          <div className="shelf">{ids.map((id) => <Thumb key={id} id={id} />)}</div>
        </section>
      ))}
    </Screen>
  );
}

export function SearchScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const dolls = useMemo(() => snap.catalog.dolls.filter((doll) => !isBlank(doll)), [snap.catalog.dolls]);
  const needle = query.trim().toLowerCase();
  const matches = dolls.filter((doll) => {
    if (!needle) return true;
    const blob = [
      doll.name,
      doll.theme,
      choiceLabel(themeChoices, doll.theme, lang),
      doll.material,
      choiceLabel(materialChoices, doll.material, lang),
      doll.givenBy,
      doll.givenWhen,
      doll.yearJoined,
      doll.notes,
      doll.storageBox,
    ].join(" ").toLowerCase();
    return blob.includes(needle);
  });
  return (
    <Screen title={t.search} onBack={nav.back}>
      <input aria-label={t.search} placeholder={t.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} />
      {matches.length === 0 ? <p>{t.searchEmpty}</p> : <div className="shelf">{matches.map((doll) => <Thumb key={doll.id} id={doll.id} />)}</div>}
    </Screen>
  );
}
