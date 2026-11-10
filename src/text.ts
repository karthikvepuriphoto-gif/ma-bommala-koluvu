import { en, te, type Lang } from "./i18n";
import { useApp } from "./lib/repository";

export function useI18n() {
  const language = useApp().lang as Lang;
  return {
    lang: language,
    t: language === "te" ? te : en,
    alt: language === "te" ? en : te,
  };
}
