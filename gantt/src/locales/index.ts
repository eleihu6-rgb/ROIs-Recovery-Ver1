import { useI18n } from '@rois/ui'
import en from './en'
import zh from './zh'
import type { GanttLocale } from './en'

const locales: Record<'en' | 'zh', GanttLocale> = { en, zh }

/** Returns gantt-specific translations, in sync with the @rois/ui locale selection. */
export const useGanttLocale = (): GanttLocale => {
  const { locale } = useI18n()
  return locales[locale] ?? locales.en
}
