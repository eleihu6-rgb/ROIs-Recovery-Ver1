import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Theme, type ThemeColors, defaultTheme, themes } from "./themes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorMode = "light" | "dark" | "system";

export interface ThemeContextValue {
  /** Current theme object */
  theme: Theme;
  /** Set active theme by name */
  setTheme: (name: string) => void;
  /** Current color mode */
  colorMode: ColorMode;
  /** Set color mode */
  setColorMode: (mode: ColorMode) => void;
  /** Resolved mode (always "light" | "dark", resolves "system") */
  resolvedMode: "light" | "dark";
  /** All available themes */
  themes: Theme[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_THEME_KEY = "rois-ui-theme";
const STORAGE_MODE_KEY = "rois-ui-color-mode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSystemMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeVariables(colors: ThemeColors) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}

function applyDarkClass(isDark: boolean) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Default theme name. Falls back to "ocean-blue". */
  defaultThemeName?: string;
  /** Default color mode. Falls back to "system". */
  defaultColorMode?: ColorMode;
}

export function ThemeProvider({
  children,
  defaultThemeName,
  defaultColorMode = "system",
}: ThemeProviderProps) {
  // Initialise from localStorage, falling back to defaults
  const [themeName, setThemeName] = useState<string>(() => {
    if (typeof window === "undefined") return defaultThemeName ?? defaultTheme.name;
    return (
      localStorage.getItem(STORAGE_THEME_KEY) ??
      defaultThemeName ??
      defaultTheme.name
    );
  });

  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    if (typeof window === "undefined") return defaultColorMode;
    return (
      (localStorage.getItem(STORAGE_MODE_KEY) as ColorMode | null) ??
      defaultColorMode
    );
  });

  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode);

  const resolvedMode: "light" | "dark" =
    colorMode === "system" ? systemMode : colorMode;

  const theme = useMemo(
    () => themes.find((t) => t.name === themeName) ?? defaultTheme,
    [themeName],
  );

  // Listen for system preference changes
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemMode(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Apply CSS variables + dark class whenever theme or mode changes
  useEffect(() => {
    const colors = resolvedMode === "dark" ? theme.dark : theme.light;
    applyThemeVariables(colors);
    applyDarkClass(resolvedMode === "dark");
  }, [theme, resolvedMode]);

  // Persist theme name
  const setTheme = useCallback((name: string) => {
    setThemeName(name);
    localStorage.setItem(STORAGE_THEME_KEY, name);
  }, []);

  // Persist color mode
  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      colorMode,
      setColorMode,
      resolvedMode,
      themes,
    }),
    [theme, setTheme, colorMode, setColorMode, resolvedMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
