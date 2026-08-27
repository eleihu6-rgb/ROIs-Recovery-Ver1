import type { PropsWithChildren } from "react";
import { I18nContext, type I18nContextValue, type TranslationValues } from "@/shared/i18n/context";
import { en, type TranslationKey } from "@/shared/i18n/locales/en";

const interpolateTranslation = (template: string, values?: TranslationValues): string => {
  if (!values) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
};

export const I18nProvider = ({ children }: PropsWithChildren) => {
  const value: I18nContextValue = {
    t: (key, values) => interpolateTranslation(en[key as TranslationKey] ?? key, values),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
