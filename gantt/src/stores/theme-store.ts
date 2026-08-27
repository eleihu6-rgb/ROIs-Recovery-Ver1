import { create } from 'zustand'
import { useGanttViewStore } from './gantt-view-store'

export type ThemeName = 'ocean-blue' | 'dark-pro' | 'emerald-green' | 'sunset-orange' | 'slate-gray'

interface ThemeStore {
  theme: ThemeName
  isDark: boolean
  setTheme: (theme: ThemeName) => void
  toggleDark: () => void
  loadFromStorage: () => void
}

const STORAGE_KEY_THEME = 'rois-theme'
const STORAGE_KEY_DARK = 'rois-dark'

/**
 * Map theme name to the CSS class applied on <html>.
 * ocean-blue uses the default (no theme class) / "dark" for dark mode.
 * Others use "theme-xxx" / "theme-xxx dark".
 */
const getThemeClass = (theme: ThemeName): string => {
  switch (theme) {
    case 'ocean-blue':
      return ''
    case 'dark-pro':
      return ''
    case 'emerald-green':
      return 'theme-emerald-green'
    case 'sunset-orange':
      return 'theme-sunset-orange'
    case 'slate-gray':
      return 'theme-slate-gray'
  }
}

const applyThemeToDOM = (theme: ThemeName, isDark: boolean): void => {
  const el = document.documentElement
  const themeClass = getThemeClass(theme)

  // For dark-pro, always force dark mode
  const effectiveDark = theme === 'dark-pro' ? true : isDark

  const classes: string[] = []
  if (themeClass) classes.push(themeClass)
  if (effectiveDark) classes.push('dark')

  el.className = classes.join(' ')
}

const markDirty = (): void => {
  useGanttViewStore.getState().markDirty()
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'ocean-blue',
  isDark: false,

  setTheme: (theme) => {
    const { isDark } = get()
    set({ theme })
    applyThemeToDOM(theme, isDark)
    try {
      localStorage.setItem(STORAGE_KEY_THEME, theme)
    } catch {
      // ignore
    }
    markDirty()
  },

  toggleDark: () => {
    const { theme, isDark } = get()
    const newDark = !isDark
    set({ isDark: newDark })
    applyThemeToDOM(theme, newDark)
    try {
      localStorage.setItem(STORAGE_KEY_DARK, String(newDark))
    } catch {
      // ignore
    }
    markDirty()
  },

  loadFromStorage: () => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) as ThemeName | null
      const savedDark = localStorage.getItem(STORAGE_KEY_DARK)
      const theme = savedTheme ?? 'ocean-blue'
      const isDark = savedDark === 'true'
      set({ theme, isDark })
      applyThemeToDOM(theme, isDark)
    } catch {
      // ignore
    }
    markDirty()
  },
}))
