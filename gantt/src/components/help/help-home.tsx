// gantt/src/components/help/help-home.tsx
import {
  LayoutDashboard, CalendarDays, FlaskConical, Database,
  Settings2, MessageSquare, BookOpen, ShieldCheck, CalendarCog, Megaphone, Scale,
} from 'lucide-react'
import { HELP_CATEGORIES } from './help-data'
import type { HelpCategory } from './help-data'

const ICONS: Record<string, React.ElementType> = {
  LayoutDashboard, CalendarDays, FlaskConical, Database,
  Settings2, MessageSquare, BookOpen, ShieldCheck, CalendarCog, Megaphone, Scale,
}

interface HelpHomeProps {
  onTopicSelect: (slug: string) => void
}

export const HelpHome = ({ onTopicSelect }: HelpHomeProps) => (
  <div className="px-8 py-6 max-w-2xl">
    <h1 className="text-xl font-bold text-foreground mb-1">Help Center</h1>
    <p className="text-xs text-muted-foreground mb-6">What do you need help with?</p>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {HELP_CATEGORIES.map((cat) => <CategoryCard key={cat.slug} cat={cat} onSelect={onTopicSelect} />)}
    </div>
  </div>
)

const CategoryCard = ({
  cat,
  onSelect,
}: {
  cat: HelpCategory
  onSelect: (slug: string) => void
}) => {
  const Icon = ICONS[cat.lucideIcon] ?? BookOpen
  const firstTopic = cat.topics[0]

  return (
    <button
      type="button"
      onClick={() => firstTopic && onSelect(firstTopic.slug)}
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{cat.title}</p>
        <p className="text-2xs text-muted-foreground mt-0.5">
          {cat.topics.length} {cat.topics.length === 1 ? 'topic' : 'topics'}
        </p>
      </div>
    </button>
  )
}
