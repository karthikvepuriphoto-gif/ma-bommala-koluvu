import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { deleteDoll, purgeDollFiles, restoreDoll } from "./lib/repository";
import type { Doll } from "./types";
import { useI18n } from "./text";
import { BigButton } from "./ui";

const UndoContext = createContext<((doll: Doll) => void) | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const { t, alt } = useI18n();
  const [doll, setDoll] = useState<Doll | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function clearTimer() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  async function remove(target: Doll) {
    clearTimer();
    const removed = await deleteDoll(target.id);
    if (!removed) return;
    setDoll(removed);
    timer.current = window.setTimeout(() => {
      setDoll(null);
      void purgeDollFiles(removed);
    }, 8000);
  }

  async function undo() {
    if (!doll) return;
    clearTimer();
    const current = doll;
    setDoll(null);
    await restoreDoll(current);
  }

  return (
    <UndoContext.Provider value={(target) => void remove(target)}>
      {children}
      {doll ? (
        <div className="undo">
          <p>{t.undoMsg}</p>
          <BigButton tone="primary" label={t.undo} alt={alt.undo} onClick={() => void undo()} />
        </div>
      ) : null}
    </UndoContext.Provider>
  );
}

export function useRemoveDoll() {
  const remove = useContext(UndoContext);
  if (!remove) throw new Error("undo");
  return remove;
}
