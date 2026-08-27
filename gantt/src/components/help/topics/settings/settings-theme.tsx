import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'

const THEMES = [
  { name: 'Ocean Blue', desc: 'The default. Clean blue tones.' },
  { name: 'Dark Pro', desc: 'Dark background with blue accents. Always uses dark mode.' },
  { name: 'Emerald Green', desc: 'Green accents, light background.' },
  { name: 'Sunset Orange', desc: 'Warm orange accents.' },
  { name: 'Slate Gray', desc: 'Neutral grey tones.' },
]

export default function SettingsTheme() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>palette icon</strong> in the top-right corner of the navigation bar.
        A dropdown opens showing the available themes and a dark/light mode toggle.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/settings-theme-open.png"
        alt="Theme switcher dropdown open showing 5 colour theme options with colour dot indicators"
        caption="Click any theme to apply it immediately. A checkmark shows your current theme."
      />
      <HelpStep n={2}>
        Click the theme you want. The app updates instantly — you do not need to reload the page.
      </HelpStep>

      <HelpNote>
        The first line at the top of the dropdown shows the <strong>running version</strong> of the app
        (for example <span className="font-mono tabular-nums">Ver:B…/F…/R…</span>), with the build version in
        fine print beneath it. This is informational only — it does not affect which theme is applied.
      </HelpNote>

      <table className="w-full text-xs mt-4">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left font-semibold text-foreground">Theme</th>
            <th className="py-2 text-left font-semibold text-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {THEMES.map((t) => (
            <tr key={t.name} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-4 font-semibold text-foreground align-top">{t.name}</td>
              <td className="py-2 text-muted-foreground align-top">{t.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <HelpControlsRef items={[
        { name: 'Palette icon', description: 'Opens the theme and dark-mode settings dropdown.' },
        { name: 'Version line', description: 'Top of the dropdown shows the running app version (Ver:B…/F…/R…) with the build version beneath it.' },
        { name: 'Theme list', description: 'Click any entry to switch the app colour scheme.' },
      ]} />
    </>
  )
}
