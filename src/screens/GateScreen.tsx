import { isGoogleConfigured } from "../config";
import { enterDemo, signIn, useApp } from "../lib/repository";
import { useI18n } from "../text";
import { BigButton } from "../ui";

export function GateScreen() {
  const snap = useApp();
  const { t, alt } = useI18n();
  const setup = snap.mode === "setup" || !isGoogleConfigured();
  return (
    <main className="screen gate">
      <img className="brand-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <p className="eyebrow">మా బొమ్మల కొలువు</p>
      <h1>Ma Bommala Koluvu</h1>
      <p className="lede">{t.tagline}</p>
      {setup ? (
        <>
          <h2>{t.setupTitle}</h2>
          <p>{t.setupBody}</p>
        </>
      ) : (
        <>
          <p>{t.privacyLine}</p>
          {snap.banner === "reach" ? <p className="status wait">{t.couldNotReach}</p> : null}
          <BigButton tone="primary" label={snap.phase === "auth" ? t.signInAgain : t.signIn} alt={alt.signIn} onClick={() => void signIn()} />
        </>
      )}
      <BigButton label={t.demoButton} alt={alt.demoButton} onClick={() => void enterDemo()} />
      <p className="hint">{t.demoHelp}</p>
    </main>
  );
}

export function Opening() {
  return (
    <main className="screen gate">
      <img className="brand-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <p className="eyebrow">మా బొమ్మల కొలువు</p>
      <h1>Ma Bommala Koluvu</h1>
      <p>Opening your dolls…</p>
    </main>
  );
}
