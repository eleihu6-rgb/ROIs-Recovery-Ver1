// gantt/src/components/help/help-nav.tsx
import { useState } from 'react'
import {
  Search, CalendarDays, FlaskConical, Settings2, MessageSquare, BookOpen,
  ShieldCheck, ChevronDown, ChevronRight, LayoutDashboard, Database, CalendarCog, Megaphone, Scale,
} from 'lucide-react'
import { HELP_CATEGORIES } from './help-data'
import type { HelpCategory } from './help-data'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  LayoutDashboard,
  CalendarDays,
  FlaskConical,
  Database,
  Scale,
  Settings2,
  MessageSquare,
  BookOpen,
  ShieldCheck,
  CalendarCog,
  Megaphone,
}

interface HelpNavProps {
  activeTopic: string | null
  onTopicSelect: (slug: string) => void
}

export const HelpNav = ({ activeTopic, onTopicSelect }: HelpNavProps) => {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(HELP_CATEGORIES.map((c) => [c.slug, c.defaultExpanded])),
  )

  const q = query.trim().toLowerCase()

  const toggle = (slug: string) =>
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }))

  const matchingTopics = (cat: HelpCategory) => {
    if (!q) return cat.topics

    const bySlug = new Map(cat.topics.map((topic) => [topic.slug, topic]))
    const keep = new Set<string>()

    for (const topic of cat.topics) {
      if (!topic.title.toLowerCase().includes(q) && !topic.overview.toLowerCase().includes(q)) continue

      keep.add(topic.slug)
      let parentSlug = topic.parentSlug
      while (parentSlug) {
        const parent = bySlug.get(parentSlug)
        if (!parent) break
        keep.add(parent.slug)
        parentSlug = parent.parentSlug
      }
    }

    return cat.topics.filter((topic) => keep.has(topic.slug))
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground mb-2">Help Center</p>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Category tree */}
      <nav className="flex-1 overflow-y-auto py-2">
        {HELP_CATEGORIES.map((cat) => {
          const topics = matchingTopics(cat)
          if (q && topics.length === 0) return null
          const isOpen = q ? true : (expanded[cat.slug] ?? cat.defaultExpanded)
          const Icon = CATEGORY_ICONS[cat.lucideIcon] ?? BookOpen
          const renderTopic = (topic: import('./help-data').HelpTopic, level = 0) => {
            const children = topics.filter((candidate) => candidate.parentSlug === topic.slug)
            const paddingLeft = 36 + level * 16
            return (
              <div key={topic.slug}>
                <button
                  type="button"
                  data-testid={`help-topic-${topic.slug}`}
                  onClick={() => onTopicSelect(topic.slug)}
                  className={[
                    'flex w-full items-center gap-1.5 px-4 py-1.5 text-xs transition-colors text-left',
                    topic.slug === activeTopic
                      ? 'bg-primary/10 text-primary font-medium border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  ].join(' ')}
                  style={{ paddingLeft }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {level > 0 ? `- ${topic.title}` : topic.title}
                  </span>
                  {topic.isNew && (
                    <span
                      data-testid={`help-new-badge-${topic.slug}`}
                      className="shrink-0 rounded-full bg-red-500 px-1.5 py-0 text-3xs font-bold uppercase tracking-wide text-white"
                    >
                      New
                    </span>
                  )}
                </button>
                {children.map((child) => renderTopic(child, level + 1))}
              </div>
            )
          }

          return (
            <div key={cat.slug}>
              {/* Category header */}
              <button
                type="button"
                data-testid={`help-cat-${cat.slug}`}
                onClick={() => toggle(cat.slug)}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{cat.title}</span>
                {isOpen
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </button>

              {/* Topics */}
              {isOpen && topics.map((topic) => (
                !topic.parentSlug && renderTopic(topic)
              ))}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
