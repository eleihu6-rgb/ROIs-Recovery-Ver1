import { createContext, useCallback, useContext, useMemo, useState } from "react";

import en from "./locales/en";
import zh from "./locales/zh";

import type { Locale } from "./locales/en";

type LocaleKey = "en" | "zh";

interface I18nContextValue {
  t: Locale;
  locale: LocaleKey;
  setLocale: (locale: LocaleKey) => void;
}

const STORAGE_KEY = "rois-locale";

const locales: Record<LocaleKey, Locale> = { en, zh };

const getInitialLocale = (): LocaleKey => {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "en";
};

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: React.ReactNode;
  defaultLocale?: LocaleKey;
}

const I18nProvider = ({ children, defaultLocale }: I18nProviderProps) => {
  const [locale, setLocaleState] = useState<LocaleKey>(
    () => defaultLocale ?? getInitialLocale(),
  );

  const setLocale = useCallback((newLocale: LocaleKey) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      t: locales[locale],
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
};

const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};

export { I18nProvider, useI18n, locales };
export type { I18nProviderProps, LocaleKey };
