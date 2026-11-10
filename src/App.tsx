import { Component, useEffect, type ReactNode } from "react";
import { GateScreen, Opening } from "./screens/GateScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { DollScreen } from "./screens/DollScreen";
import { StoryScreen } from "./screens/StoryScreen";
import { SearchScreen, SetsScreen, StepsScreen } from "./screens/BrowseScreen";
import { PackingScreen, ShareScreen, YearScreen } from "./screens/ExtraScreens";
import { FilmScreen } from "./screens/FilmScreen";
import { YouTubeScreen } from "./screens/YouTubeScreen";
import { NavProvider, useNav } from "./nav";
import { boot, signIn, useApp } from "./lib/repository";
import { useI18n } from "./text";
import { BigButton } from "./ui";
import { UndoProvider } from "./undo";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="screen">
          <h1>Something went wrong</h1>
          <p>Please close this page and open it again. Your dolls are still saved.</p>
          <button type="button" className="big tone-primary" data-tap="primary" onClick={() => location.reload()}>
            Open again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function SignInAgain() {
  const { t, alt } = useI18n();
  return (
    <div className="overlay">
      <div className="dialog">
        <h2>{t.signInAgain}</h2>
        <p>{t.signInAgainHelp}</p>
        <BigButton tone="primary" label={t.signInAgain} alt={alt.signInAgain} onClick={() => void signIn()} />
      </div>
    </div>
  );
}

function Shell() {
  const { screen } = useNav();
  const screenKey = "id" in screen ? `${screen.name}:${screen.id}` : screen.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);
  if (screen.name === "doll") return <DollScreen id={screen.id} />;
  if (screen.name === "story") return <StoryScreen id={screen.id} />;
  if (screen.name === "steps") return <StepsScreen />;
  if (screen.name === "sets") return <SetsScreen />;
  if (screen.name === "search") return <SearchScreen />;
  if (screen.name === "packing") return <PackingScreen />;
  if (screen.name === "years") return <YearScreen />;
  if (screen.name === "film") return <FilmScreen />;
  if (screen.name === "youtube") return <YouTubeScreen />;
  if (screen.name === "share") return <ShareScreen />;
  return <HomeScreen />;
}

function Router() {
  const snap = useApp();
  useEffect(() => {
    void boot();
  }, []);
  if (!snap.ready || snap.mode === "loading") return <Opening />;
  if (snap.mode === "setup" || snap.mode === "signin") return <GateScreen />;
  return (
    <NavProvider>
      <UndoProvider>
        <Shell />
        {snap.phase === "auth" ? <SignInAgain /> : null}
      </UndoProvider>
    </NavProvider>
  );
}

export function App() {
  return (
    <Boundary>
      <Router />
    </Boundary>
  );
}
