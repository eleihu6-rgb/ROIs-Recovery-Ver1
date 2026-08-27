import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  Tooltip, TooltipContent, TooltipTrigger,
} from '@rois/ui'
import { Sun, Moon, Palette } from 'lucide-react'
import { useThemeStore, type ThemeName } from '@/stores/theme-store'
import { useAppVersionStore } from '@/services/app-version-service'

interface ThemeOption {
  name: ThemeName
  label: string
  color: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { name: 'ocean-blue', label: 'Ocean Blue', color: '#3b82f6' },
  { name: 'dark-pro', label: 'Dark Pro', color: '#1a2030' },
  { name: 'emerald-green', label: 'Emerald Green', color: '#16a34a' },
  { name: 'sunset-orange', label: 'Sunset Orange', color: '#f97316' },
  { name: 'slate-gray', label: 'Slate Gray', color: '#64748b' },
]

export const ThemeSwitcher = () => {
  const theme = useThemeStore((s) => s.theme)
  const isDark = useThemeStore((s) => s.isDark)
  const setTheme = useThemeStore((s) => s.setTheme)
  const toggleDark = useThemeStore((s) => s.toggleDark)
  const appVersion = useAppVersionStore((s) => s.appVersion)

  const currentOption = THEME_OPTIONS.find((t) => t.name === theme) ?? THEME_OPTIONS[0]

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="theme-switcher-trigger"
              aria-label="Theme"
              className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
            >
              <Palette className="h-4 w-4" />
              <span
                className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background shadow-sm"
                style={{ backgroundColor: currentOption.color }}
              />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Theme</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-52">
        <div className="px-2 py-1.5 text-2xs text-muted-foreground/50 tabular-nums">
          <div className="font-semibold text-muted-foreground/70">{appVersion}</div>
          <div>{__APP_VERSION__}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
        {THEME_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.name}
            onClick={() => setTheme(opt.name)}
            className="gap-2 text-xs"
          >
            <span
              className="inline-block h-3 w-3 rounded-full border border-border shadow-sm"
              style={{ backgroundColor: opt.color }}
            />
            {opt.label}
            {theme === opt.name && <span className="ml-auto text-primary">&#10003;</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleDark} className="gap-2 text-xs">
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
