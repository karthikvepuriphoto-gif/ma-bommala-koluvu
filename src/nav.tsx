import { createContext, useContext, useState, type ReactNode } from "react";

export type Screen =
  | { name: "home" }
  | { name: "doll"; id: string }
  | { name: "story"; id: string }
  | { name: "steps" }
  | { name: "sets" }
  | { name: "search" }
  | { name: "packing" }
  | { name: "years" }
  | { name: "film" }
  | { name: "youtube" }
  | { name: "share" };

interface NavValue {
  screen: Screen;
  go: (screen: Screen) => void;
  back: () => void;
  reset: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const value: NavValue = {
    screen: stack[stack.length - 1] ?? { name: "home" },
    go: (screen) => setStack((prev) => [...prev, screen]),
    back: () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)),
    reset: () => setStack([{ name: "home" }]),
  };
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const value = useContext(NavContext);
  if (!value) throw new Error("nav");
  return value;
}
