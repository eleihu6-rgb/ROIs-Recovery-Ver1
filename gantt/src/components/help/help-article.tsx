// gantt/src/components/help/help-article.tsx
import type { ReactNode } from 'react'
import { findTopic, findCategory } from './help-data'

// ── Article shell ────────────────────────────────────────────────────────────

interface HelpArticleProps {
  slug: string
  children: ReactNode
}

export const HelpArticle = ({ slug, children }: HelpArticleProps) => {
  const topic    = findTopic(slug)
  const category = topic ? findCategory(topic.categorySlug) : null

  return (
    <article className="max-w-2xl px-8 py-6">
      {/* Breadcrumb */}
      {category && topic && (
        <p className="text-2xs text-muted-foreground mb-2">
          {category.title} &rsaquo; {topic.title}
        </p>
      )}

      {/* Title + step count */}
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-xl font-bold text-foreground">{topic?.title}</h1>
        {topic?.stepCount != null && (
          <span className="text-2xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground shrink-0">
            {topic.stepCount} steps
          </span>
        )}
      </div>

      {/* Overview box */}
      {topic?.overview && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-md p-3 mb-5 text-xs text-green-800 dark:text-green-200 leading-relaxed">
          {topic.overview}
        </div>
      )}

      {/* Body */}
      {children}
    </article>
  )
}

// ── Helper components used inside topic files ────────────────────────────────

export const HelpH2 = ({ children }: { children: ReactNode }) => (
  <h2 className="text-sm font-semibold text-foreground mt-6 mb-3">{children}</h2>
)

export const HelpStep = ({ n, children }: { n: number; children: ReactNode }) => (
  <div className="flex gap-2 mb-3">
    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">
      {n}
    </div>
    <div className="text-xs text-foreground leading-relaxed">{children}</div>
  </div>
)

export const HelpTip = ({ children }: { children: ReactNode }) => (
  <div className="bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-400 dark:border-blue-500 rounded-r-md p-2.5 my-3 text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
    <strong>Tip: </strong>{children}
  </div>
)

export const HelpNote = ({ children }: { children: ReactNode }) => (
  <div className="bg-yellow-50 dark:bg-yellow-950/40 border-l-4 border-yellow-400 dark:border-yellow-500 rounded-r-md p-2.5 my-3 text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed">
    <strong>Note: </strong>{children}
  </div>
)

export const HelpWarning = ({ children }: { children: ReactNode }) => (
  <div className="bg-orange-50 dark:bg-orange-950/40 border-l-4 border-orange-500 dark:border-orange-400 rounded-r-md p-2.5 my-3 text-xs text-orange-900 dark:text-orange-200 leading-relaxed">
    <strong>Warning: </strong>{children}
  </div>
)

interface HelpScreenshotProps {
  src: string
  alt: string
  caption: string
}

/**
 * Resolve a screenshot path against Vite's base URL (the app is served under
 * `/altair/`, so a root-absolute `/help/...` path would 404). Files in
 * `public/` are served at `<base>help/...`.
 */
const resolveAsset = (src: string): string => {
  if (/^https?:\/\//.test(src)) return src
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/${src.replace(/^\//, '')}`
}

export const HelpScreenshot = ({ src, alt, caption }: HelpScreenshotProps) => (
  <figure className="my-4">
    <img
      src={resolveAsset(src)}
      alt={alt}
      className="mx-auto block h-auto max-w-full rounded-md border border-border shadow-sm"
      onLoad={(e) => {
        // Screenshots are captured at 2× device pixel ratio, so a PNG's pixel
        // width is twice the logical size it was shot at. Render at that logical
        // size (naturalWidth / 2) for crisp output, capped to the container by
        // max-w-full — this prevents small toolbar crops from being upscaled and
        // blurred while still letting wide captures fill the available width.
        const img = e.currentTarget
        if (img.naturalWidth) img.style.width = `${img.naturalWidth / 2}px`
      }}
      onError={(e) => {
        const img = e.currentTarget
        img.style.display = 'none'
        const ph = img.nextElementSibling as HTMLElement | null
        if (ph) ph.style.display = 'flex'
      }}
    />
    {/* Shown only when the screenshot file is missing */}
    <div className="hidden w-full h-28 rounded-md border border-dashed border-muted-foreground/40 items-center justify-center text-2xs text-muted-foreground">
      {alt}
    </div>
    <figcaption className="text-2xs text-muted-foreground italic mt-1.5 text-center">
      {caption}
    </figcaption>
  </figure>
)

interface ControlItem {
  name: string
  description: string
  /** Optional small icon shown in a leading column, mirroring the real control. */
  icon?: ReactNode
}

export const HelpControlsRef = ({ items }: { items: ControlItem[] }) => {
  const hasIcons = items.some((item) => item.icon)
  return (
    <div className="mt-6 pt-4 border-t border-border">
      <h3 className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Controls on this screen
      </h3>
      <table className="w-full text-xs">
        <tbody>
          {items.map((item) => (
            <tr key={item.name} className="border-b border-border/50 last:border-0">
              {hasIcons && (
                <td className="py-2 pr-3 align-top">
                  <span className="inline-flex h-5 w-5 items-center justify-center shrink-0 text-muted-foreground">
                    {item.icon}
                  </span>
                </td>
              )}
              <td className="py-2 pr-4 font-semibold text-foreground w-2/5 align-top">{item.name}</td>
              <td className="py-2 text-muted-foreground align-top">{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
