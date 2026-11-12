import { isBlank, dollTitle } from "../types";
import { createDoll, leaveDemo, setLanguage, signOut, useApp } from "../lib/repository";
import { useNav } from "../nav";
import { useI18n } from "../text";
import { ZoomablePhoto } from "../PhotoZoom";
import { BigButton, Dock, StatusLine, dollKind, libraryKind, useBlobUrl } from "../ui";
import { stepLabel as stepText } from "../i18n";

function DollCard({ id }: { id: string }) {
  const snap = useApp();
  const nav = useNav();
  const { t, lang } = useI18n();
  const doll = snap.catalog.dolls.find((item) => item.id === id);
  const url = useBlobUrl(doll?.photoLocalKey, doll?.photoDriveId);
  if (!doll || isBlank(doll)) return null;
  const name = dollTitle(doll, t.dollFallback);
  return (
    <div className="card">
      {url ? <ZoomablePhoto className="card-photo" src={url} alt={name} /> : <span className="thumb-fallback" aria-hidden="true" />}
      <button type="button" className="card-main" data-tap="primary" onClick={() => nav.go({ name: "story", id: doll.id })}>
        <strong>{name}</strong>
        <span className="meta">{doll.step ? stepText(doll.step, lang) : t.notSure}</span>
        <span className="meta">{dollKind(doll.id, snap) === "device" ? t.savedDevice : dollKind(doll.id, snap) === "waiting" ? t.waiting : t.savedDrive}</span>
      </button>
    </div>
  );
}

export function HomeScreen() {
  const snap = useApp();
  const nav = useNav();
  const { t, alt, lang } = useI18n();
  const dolls = [...snap.catalog.dolls].filter((doll) => !isBlank(doll)).sort((a, b) => a.order - b.order);
  return (
    <main className="screen has-dock">
      {snap.mode === "demo" ? <p className="banner">{t.demoBanner}</p> : null}
      <img className="brand-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <p className="eyebrow">మా బొమ్మల కొలువు</p>
      <h1>Ma Bommala Koluvu</h1>
      <p className="lede">{t.tagline}</p>
      {snap.email ? <p className="hint">{t.signedInAs} {snap.email}</p> : null}
      <StatusLine kind={libraryKind(snap)} />
      <h2>{t.yourDolls}</h2>
      {dolls.length === 0 ? <p>{t.noDolls}</p> : dolls.map((doll) => <DollCard key={doll.id} id={doll.id} />)}
      <BigButton label={t.browseSteps} alt={alt.browseSteps} onClick={() => nav.go({ name: "steps" })} />
      <BigButton label={t.browseSets} alt={alt.browseSets} onClick={() => nav.go({ name: "sets" })} />
      <BigButton label={t.search} alt={alt.search} onClick={() => nav.go({ name: "search" })} />
      <BigButton label={t.years} alt={alt.years} onClick={() => nav.go({ name: "years" })} />
      <BigButton label={t.packing} alt={alt.packing} onClick={() => nav.go({ name: "packing" })} />
      <BigButton label={t.makeFilm} alt={alt.makeFilm} onClick={() => nav.go({ name: "film" })} />
      <BigButton label={t.share} alt={alt.share} onClick={() => nav.go({ name: "share" })} />
      <h2>{t.language}</h2>
      <div className="row">
        <BigButton label={t.english} aria-pressed={lang === "en"} onClick={() => setLanguage("en")} />
        <BigButton label={t.telugu} aria-pressed={lang === "te"} onClick={() => setLanguage("te")} />
      </div>
      {snap.mode === "demo" ? (
        <BigButton
          label={t.leaveDemo}
          alt={alt.leaveDemo}
          onClick={() => {
            leaveDemo();
            nav.reset();
          }}
        />
      ) : null}
      {snap.mode === "google" ? (
        <BigButton
          label={t.signOut}
          alt={alt.signOut}
          onClick={() => {
            signOut();
            nav.reset();
          }}
        />
      ) : null}
      <Dock>
        <BigButton
          className="thumb-action"
          tone="primary"
          label={t.addDoll}
          alt={alt.addDoll}
          onClick={() => {
            void createDoll().then((id) => nav.go({ name: "doll", id }));
          }}
        />
      </Dock>
    </main>
  );
}
