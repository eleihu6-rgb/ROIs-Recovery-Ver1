import { useState, type FormEvent, type ReactNode } from 'react'
import { BookOpen, FileCode2, History, ListChecks, Lock, Search, Target, Wrench } from 'lucide-react'
import { Button } from '@rois/ui'

import { useDevStore } from '@/stores/dev-store'

import {
  ENHANCEMENT_LOG,
  FOCUS_AREAS,
  FOCUS_LABEL,
  PLAYBOOK_STEPS,
  type EnhancementEntry,
  type FocusKey,
} from './dev-playbook-data'
import { DEV_SKILLS, type DevSkillEntry } from './dev-skills-data.generated'

const formatSkillNumber = (number: number | null) => (number === null ? '--' : String(number).padStart(3, '0'))

/** Code gate: separate login, soft (frontend-only) — keeps tab out of casual view. */
const DevGate = () => {
  const tryUnlock = useDevStore((s) => s.tryUnlock)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!tryUnlock(code)) setError(true)
  }

  return (
    <div data-testid="dev-gate" className="flex h-full items-center justify-center bg-background">
      <form
        onSubmit={submit}
        className="flex w-80 flex-col gap-3 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Dev access</span>
        </div>
        <p className="text-2xs text-muted-foreground">
          Enter dev access code to view Code Enhancement Playbook. This code is separate from login.
        </p>
        <input
          data-testid="dev-code-input"
          type="password"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError(false)
          }}
          placeholder="Access code"
          aria-label="Dev access code"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        />

        {error && (
          <span data-testid="dev-code-error" className="text-2xs text-destructive">
            Incorrect code. Try again.
          </span>
        )}

        <Button data-testid="dev-code-submit" type="submit" size="sm" className="w-full">
          Unlock
        </Button>
      </form>
    </div>
  )
}

const FOCUS_BADGE: Record<string, string> = {
  'gantt-perf': 'bg-primary/10 text-primary',
  'system-efficiency': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'code-quality': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

const FocusBadge = ({ focus }: { focus: FocusKey }) => (
  <span
    className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-medium ${
      FOCUS_BADGE[focus] ?? 'bg-muted text-muted-foreground'
    }`}
  >
    {FOCUS_LABEL[focus]}
  </span>
)

const EntryCard = ({ e }: { e: EnhancementEntry }) => (
  <div className="rounded-md border border-border bg-card p-3">
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <FocusBadge focus={e.focus} />
      <span className="font-mono text-2xs font-medium text-foreground">{e.module}</span>
      {e.author && <span className="text-2xs text-muted-foreground">· {e.author}</span>}
    </div>
    <p className="text-xs text-foreground">{e.summary}</p>
    <p className="mt-1 font-mono text-2xs text-muted-foreground">{e.proof}</p>
  </div>
)

const matchesSearch = (e: EnhancementEntry, q: string): boolean => {
  if (!q) return true
  const hay = `${e.module} ${e.summary} ${e.proof} ${FOCUS_LABEL[e.focus]}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

/** Sticky filter+search toolbar so controls stay reachable no matter how long log grows. */
const TimelineToolbar = () => {
  const focusFilter = useDevStore((s) => s.focusFilter)
  const setFocusFilter = useDevStore((s) => s.setFocusFilter)
  const search = useDevStore((s) => s.search)
  const setSearch = useDevStore((s) => s.setSearch)

  const chip = (active: boolean) =>
    [
      'rounded px-2 py-0.5 text-2xs font-medium transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
    ].join(' ')

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <button className={chip(focusFilter === null)} onClick={() => setFocusFilter(null)} data-testid="dev-focus-all">
          All
        </button>
        {FOCUS_AREAS.map((f) => (
          <button
            key={f.key}
            data-testid={`dev-focus-${f.key}`}
            className={chip(focusFilter === f.key)}
            onClick={() => setFocusFilter(focusFilter === f.key ? null : f.key)}
          >
            {FOCUS_LABEL[f.key]}
          </button>
        ))}
      </div>
      <div className="relative ml-auto">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid="dev-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search enhancements…"
          aria-label="Search enhancements"
          className="h-7 w-48 rounded-md border border-border bg-background pl-7 pr-2 text-2xs text-foreground outline-none focus:border-primary"
        />
      </div>
    </div>
  )
}

/** Newest-first timeline grouped by date; date highlighted anchor. */
const TimelineList = () => {
  const moduleFilter = useDevStore((s) => s.moduleFilter)
  const focusFilter = useDevStore((s) => s.focusFilter)
  const search = useDevStore((s) => s.search)
  const filtered = ENHANCEMENT_LOG.filter(
    (e) =>
      (!moduleFilter || e.module === moduleFilter) &&
      (!focusFilter || e.focus === focusFilter) &&
      matchesSearch(e, search),
  )
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
  const groups: Array<[string, EnhancementEntry[]]> = []
  for (const e of sorted) {
    const last = groups[groups.length - 1]
    if (last && last[0] === e.date) last[1].push(e)
    else groups.push([e.date, [e]])
  }

  return (
    <div data-testid="dev-enhancement-log" className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-3 text-2xs text-muted-foreground">
        Showing {filtered.length} of {ENHANCEMENT_LOG.length} recorded
      </div>

      {groups.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-6 text-center text-xs italic text-muted-foreground">
          {moduleFilter ? `No job done yet ${moduleFilter}.` : 'No enhancements match current filter.'}
        </div>
      ) : (
        <div className="relative pl-6">
          {/* ui-standard-ignore-next-line — timeline vertical rail, geometric pixel positioning */}
          <div className="absolute bottom-1 left-[7px] top-2 w-px bg-border" />
          {groups.map(([date, entries]) => (
            <div key={date} data-testid={`dev-day-${date}`} className="relative mb-5 last:mb-0">
              {/* ui-standard-ignore-next-line — timeline dot, geometric pixel positioning */}
              <div className="absolute -left-[1.15rem] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
              <div className="mb-2 flex items-baseline gap-2">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-primary">
                  {date}
                </span>
                <span className="text-2xs text-muted-foreground">
                  {entries.length} enhancement{entries.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {entries.map((e, i) => (
                  <EntryCard key={i} e={e} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Playbook reference — focus areas + six-phase loop. */
const PlaybookPanel = () => (
  <div data-testid="dev-playbook" className="flex-1 overflow-y-auto">
    <section className="px-4 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-foreground">Focus areas (priority order)</h2>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {FOCUS_AREAS.map((f) => (
          <div key={f.key} className="rounded-md border border-border bg-card p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-2xs font-bold text-muted-foreground">#{f.priority}</span>
              <span className="text-xs font-semibold text-foreground">{f.label}</span>
            </div>
            <p className="text-2xs text-muted-foreground">{f.detail}</p>
          </div>
        ))}
      </div>
    </section>
    <section data-testid="dev-playbook-steps" className="px-4 pb-6 pt-5">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-foreground">The loop — run periodically</h2>
      </div>
      <div className="overflow-x-auto">
        {/* ui-standard-ignore-next-line — six columns need stable minimum width */}
        <div className="min-w-[680px]">
          <div className="grid grid-cols-6 gap-2">
            {PLAYBOOK_STEPS.map((s) => (
              <div
                key={s.n}
                title={s.detail}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-3xs font-bold tabular-nums text-primary-foreground">
                  {s.n}
                </span>
                <span className="text-2xs font-semibold leading-tight text-foreground">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-6 gap-2">
            {PLAYBOOK_STEPS.map((s) => (
              <p key={s.n} className="px-1 text-3xs leading-snug text-muted-foreground">
                {s.detail}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  </div>
)

const SkillFact = ({ label, children }: { label: string; children: ReactNode }) => (
  <section className="rounded-md border border-border bg-card p-3">
    <h3 className="mb-1 text-2xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</h3>
    <div className="text-xs leading-relaxed text-foreground">{children}</div>
  </section>
)

const SkillDetails = ({ skill }: { skill: DevSkillEntry }) => (
  <div data-testid="dev-skill-details" className="flex-1 overflow-y-auto px-4 py-4">
    <div className="mb-3 flex flex-wrap items-start gap-3">
      <span className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-bold tabular-nums text-primary">
        {formatSkillNumber(skill.number)}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">{skill.title || skill.folder}</h2>
        <p className="font-mono text-2xs text-muted-foreground">{skill.folder}</p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <SkillFact label="What This Skill Is About">
        <p>{skill.description || skill.overview}</p>
      </SkillFact>
      <SkillFact label="Function">
        <p>{skill.function}</p>
      </SkillFact>
      <SkillFact label="How To Use">
        <p>{skill.howToUse}</p>
      </SkillFact>
      <SkillFact label="Project Source">
        <p className="font-mono text-2xs text-muted-foreground">{skill.sourcePath}</p>
      </SkillFact>
      <section className="rounded-md border border-border bg-card p-3 xl:col-span-2">
        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-normal text-muted-foreground">
          Resources And Metadata
        </h3>
        {skill.resources.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skill.resources.map((resource) => (
              <span
                key={resource}
                className="rounded bg-muted px-2 py-1 font-mono text-2xs text-muted-foreground"
              >
                {resource}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No bundled resources beyond SKILL.md.</p>
        )}
      </section>
    </div>
  </div>
)

const SkillsPanel = () => {
  const selectedSkill = useDevStore((s) => s.selectedSkill)
  const skill = DEV_SKILLS.find((entry) => entry.folder === selectedSkill) ?? DEV_SKILLS[0]

  if (!skill) {
    return (
      <div data-testid="dev-skill-details" className="flex-1 px-4 py-4 text-xs text-muted-foreground">
        No project skills found.
      </div>
    )
  }

  return <SkillDetails skill={skill} />
}

const SubViewTabs = () => {
  const subView = useDevStore((s) => s.subView)
  const setSubView = useDevStore((s) => s.setSubView)

  const tab = (active: boolean) =>
    [
      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
    ].join(' ')

  return (
    <div className="ml-auto flex items-center gap-1">
      <button data-testid="dev-subview-timeline" className={tab(subView === 'timeline')} onClick={() => setSubView('timeline')}>
        <History className="h-3.5 w-3.5" />
        Timeline
      </button>
      <button data-testid="dev-subview-playbook" className={tab(subView === 'playbook')} onClick={() => setSubView('playbook')}>
        <ListChecks className="h-3.5 w-3.5" />
        Playbook
      </button>
      <button data-testid="dev-subview-skills" className={tab(subView === 'skills')} onClick={() => setSubView('skills')}>
        <BookOpen className="h-3.5 w-3.5" />
        Skills
      </button>
    </div>
  )
}

const DevContent = () => {
  const subView = useDevStore((s) => s.subView)

  return (
    <div data-testid="dev-content" className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        {subView === 'skills' ? (
          <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">
          {subView === 'skills' ? 'Project Skill Playbook' : 'Code Enhancement Playbook'}
        </span>
        <SubViewTabs />
      </div>

      {subView === 'playbook' ? (
        <PlaybookPanel />
      ) : subView === 'skills' ? (
        <SkillsPanel />
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <TimelineToolbar />
          <TimelineList />
        </div>
      )}
    </div>
  )
}

export const DevView = () => {
  const unlocked = useDevStore((s) => s.unlocked)

  return <div data-testid="dev-view" className="h-full">{unlocked ? <DevContent /> : <DevGate />}</div>
}
