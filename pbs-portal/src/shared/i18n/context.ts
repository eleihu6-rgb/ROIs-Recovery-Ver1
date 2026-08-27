import { createContext } from "react";
import type { TranslationKey } from "@/shared/i18n/locales/en";

export type TranslationValues = Record<string, number | string>;

export type I18nContextValue = {
  t: (key: TranslationKey | string, values?: TranslationValues) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
