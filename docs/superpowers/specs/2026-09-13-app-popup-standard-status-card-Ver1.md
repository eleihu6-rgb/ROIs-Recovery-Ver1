# Pop-up (对话框 / 弹窗) Standard — Status-Card Anatomy (Ver 1)

Date: 2026-09-13
Owner: Ryan (design reference) · implemented by the UI/UX + frontend workstream
Supersedes: the "blue title bar + footer bar" chrome described in the previous
「弹窗窗口标准」 (kept only as the `panel` variant's density baseline)
Applies to: `gantt`, `pbs-portal` (web) and `crew-app` (React Native)

## 1. Why

Ryan supplied a status-card reference (success / error cards: coloured header band with a
centred outline circle glyph, an overhanging circular close button, centred title + message, a
single pill action). The previous standard (blue title bar, small left icon, grey footer bar with
buttons bottom-right) was functional but read as a generic enterprise dialog: the tone of a
message was invisible, and every pop-up looked the same whether it reported success, failure, or
asked for data entry.

Goal: one pop-up chrome across all three surfaces, carrying **tone** (success / error / warning /
neutral) at a glance, matching the product theme colours, with exactly one implementation per
surface.

## 2. Anatomy

```
        ╭───────────────────────────╮   ← overhanging circular close (white disc, dark ✕)
   ┌────┴───────────────────────────┴────┐
   │  ▒▒▒ tone band (primary|success|warning|destructive) ▒▒▒ │
   │              ╭─────────╮             │
   │              │   ✓ / ✕  │  ← outline circle glyph, white stroke
   │              ╰─────────╯             │
   ├──────────────────────────────────────┤
   │            Title (centred, bold)     │
   │      Message (centred, muted, 1-3    │
   │      lines)                          │
   │        [ Cancel ]  [ Primary ]       │  ← pill actions, centred
   ╰──────────────────────────────────────╯
```

1. **Card** — same radius/shadow/border as today (`rounded-lg border border-border bg-background
   shadow-xl`), `overflow-visible` on the content wrapper so the close disc can overhang.
2. **Tone band** — full-bleed top region, `h-28` for `status`, `h-11` for `panel`, coloured by
   `tone` (see §3). The band carries the drag handle (unchanged behaviour) and the top corners'
   radius.
3. **Outline circle glyph** — `status`: centred, `h-14 w-14` circle, `border-2` + glyph inside,
   `stroke-width` 2, colour `*-foreground` (white). `panel`: `h-7 w-7` circle at the left of the
   band, title inline to its right (keeps information density for data dialogs).
4. **Title** — `status`: body, centred, `text-base font-semibold`. `panel`: inside the band,
   white, left-aligned after the glyph (`text-sm font-semibold`), as today.
5. **Message / description** — `status`: body, centred, `text-xs text-muted-foreground`.
   `panel`: unchanged (top of the body, `text-xs`, left).
6. **Actions** — one centred pill row at the end of the body. No footer bar. Cancel renders as an
   outline pill, the primary action as a filled pill in the tone colour; destructive actions use
   `destructive`. Every button inside the row is forced to the pill radius by the row container,
   so call sites keep using the shared `Button` variants.
7. **Close** — a white circular disc (`h-7 w-7`, `bg-background`, `shadow`, dark ✕) straddling the
   top-right corner (`-right-3 -top-3`). Keyboard/`Esc` and overlay dismissal are unchanged.
8. **Behaviour kept from the previous standard (non-visual, still mandatory)** — draggable window
   (`draggable`, header is the handle), optional `resizable`, `dismissable=false` while an
   operation is in flight, `modal=false` for navigator-style windows, `data-testid` forwarding,
   and the nested-floating-layer guards (Select/Popover inside a dialog must not dismiss it).

## 3. Tone → token mapping

`tone` is semantic, never brand. The band always uses a theme token so every theme preset
(`:root`, `.dark`, `.theme-emerald-green`, `.theme-sunset-orange`, `.theme-slate-gray`) recolours
the chrome automatically.

| tone | band background | foreground | glyph | use for |
|---|---|---|---|---|
| `neutral` (default) | `bg-primary` | `text-primary-foreground` | `info` / caller `icon` | data entry, settings, neutral confirmations |
| `success` | `bg-success` | `text-success-foreground` | `check` | "saved", "sent", "published", all-clear |
| `warning` | `bg-warning` | `text-warning-foreground` | `alert` | degraded/partial result, "check this before continuing" |
| `destructive` | `bg-destructive` | `text-destructive-foreground` | `x` | failure, rejection, delete/stand-down confirmations |

`--success` / `--success-foreground` / `--warning` / `--warning-foreground` are new tokens defined
in `packages/ui/src/styles/globals.css` (`@theme` + a `:root` value + a `.dark` override).
`--destructive` already exists.

## 4. One implementation per surface

| surface | component | notes |
|---|---|---|
| gantt / pbs-portal | `@rois/ui` `AppDialog` (`packages/ui/src/composites/app-dialog.tsx`) | only legal pop-up; raw Radix `Dialog`/`AlertDialog`, `Modal`, `Drawer`, `Sheet`, `Popover`-as-dialog are forbidden |
| crew-app | `components/v2/AppDialog.tsx` (React Native `Modal`) | same anatomy/palette via the carrier palette; native `Alert.alert` is only allowed for OS-level prompts (permissions, keychain) — product status/confirm pop-ups use this component |

## 5. API compatibility (web)

`AppDialog` keeps every existing prop and behaviour; new props are additive:

```ts
variant?: 'status' | 'panel'   // default 'panel' — existing call sites keep their density
tone?: 'neutral' | 'success' | 'warning' | 'destructive'   // default 'neutral' (= today's blue)
statusIcon?: React.ReactNode   // optional override for the tone glyph
```

Migration rules for the 68 existing call sites:

- Data / form / table dialogs: no change required. They keep `title`, `description`, `children`
  layout; the chrome (band, close disc) and the pill action row are applied by the component.
- Message-only dialogs (success/error/confirm, no inputs): switch to `variant="status"` and set
  `tone`; the icon becomes the tone glyph and the body copy should stay ≤ 3 lines.
- A dialog that only says "done"/"failed" must not keep its old left-aligned prose layout.

## 6. Verification (per surface, mandatory)

- Web: Playwright drives the real UI for at least one dialog per tone and at least one data dialog,
  asserting tone-specific text and capturing `docs/assets/screenshots/<module>/<feature>-VerN.png`;
  `npx tsc --noEmit`; `npm run check:ui` (hard violations = 0).
- crew-app: Jest render test per state, `npx tsc --noEmit`, and a Maestro flow that opens the new
  pop-up on the simulator with a screenshot.
- `scripts/check-ui-standard.mjs` gains a guard so a new pop-up cannot bypass the standard (raw
  Radix dialog imports outside `packages/ui`, or a `Modal`-based pop-up in gantt/pbs-portal).
