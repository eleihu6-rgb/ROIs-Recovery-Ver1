import { useState, type ReactNode } from 'react'
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, Circle, Layers, Wrench } from 'lucide-react'

import { useDevStore } from '@/stores/dev-store'

import { moduleStats, overviewStats } from './dev-playbook-data'
import { DEV_SKILLS } from './dev-skills-data.generated'

const formatSkillNumber = (number: number | null) => (number === null ? '--' : String(number).padStart(3, '0'))

/** Left-sidebar navigator for Dev tab modules and project skills. */
export const DevSidebar = ({ isCollapsed }: { isCollapsed: boolean }) => {
  const unlocked = useDevStore((s) => s.unlocked)
  const moduleFilter = useDevStore((s) => s.moduleFilter)
  const selectedSkill = useDevStore((s) => s.selectedSkill)
  const setModuleFilter = useDevStore((s) => s.setModuleFilter)
  const setSelectedSkill = useDevStore((s) => s.setSelectedSkill)
  const [modulesOpen, setModulesOpen] = useState(true)
  const [skillsOpen, setSkillsOpen] = useState(false)

  if (!unlocked) return null

  const stats = moduleStats()
  const { doneModules, totalModules, totalEntries, lastDate } = overviewStats()

  if (isCollapsed) {
    return (
      <div data-testid="dev-sidebar" className="flex flex-col items-center gap-1 py-2">
        <Wrench className="h-4 w-4 text-sidebar-foreground/70" />
        <span className="font-mono text-2xs font-bold tabular-nums text-sidebar-foreground">
          {doneModules}/{totalModules}
        </span>
        <BookOpen className="mt-2 h-4 w-4 text-sidebar-foreground/70" />
        <span className="font-mono text-2xs font-bold tabular-nums text-sidebar-foreground">
          {DEV_SKILLS.length}
        </span>
      </div>
    )
  }

  const selectModule = (module: string) => setModuleFilter(moduleFilter === module ? null : module)
  const selectSkill = (skill: string) => setSelectedSkill(skill)

  const TreeHeader = ({
    icon,
    label,
    count,
    open,
    onToggle,
    testId,
  }: {
    icon: ReactNode
    label: string
    count: number
    open: boolean
    onToggle: () => void
    testId: string
  }) => (
    <button
      type="button"
      data-testid={testId}
      data-open={open ? 'true' : 'false'}
      onClick={onToggle}
      className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
      )}
      {icon}
      <span className="text-xs font-semibold">{label}</span>
      <span className="ml-auto font-mono text-2xs tabular-nums text-sidebar-foreground/55">{count}</span>
    </button>
  )

  return (
    <div data-testid="dev-sidebar" className="flex flex-col gap-2 p-2">
      <div>
        <TreeHeader
          testId="dev-tree-skills"
          icon={<BookOpen className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70" />}
          label="Skill"
          count={DEV_SKILLS.length}
          open={skillsOpen}
          onToggle={() => setSkillsOpen((value) => !value)}
        />
        {skillsOpen ? (
          <div data-testid="dev-skill-tree" className="mt-1 flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
            {DEV_SKILLS.map((skill) => {
              const active = selectedSkill === skill.folder
              return (
                <button
                  key={skill.folder}
                  type="button"
                  data-testid={`dev-sidebar-skill-${skill.folder}`}
                  onClick={() => selectSkill(skill.folder)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    selectSkill(skill.folder)
                  }}
                  aria-pressed={active}
                  className={[
                    'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'border-sidebar-primary bg-sidebar-accent'
                      : 'border-transparent hover:bg-sidebar-accent/60',
                  ].join(' ')}
                >
                  <span className="w-7 shrink-0 rounded bg-sidebar-accent/70 px-1 py-0.5 text-center font-mono text-2xs font-semibold tabular-nums text-sidebar-foreground">
                    {formatSkillNumber(skill.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-2xs font-medium text-sidebar-foreground">
                    {skill.folder.replace(/^\d{3}-/, '')}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="border-t border-sidebar-border pt-2">
        <TreeHeader
          testId="dev-tree-modules"
          icon={<Layers className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70" />}
          label="Modules"
          count={totalModules}
          open={modulesOpen}
          onToggle={() => setModulesOpen((value) => !value)}
        />
        {modulesOpen ? (
          <div data-testid="dev-modules-tree" className="mt-1 flex flex-col gap-2">
            <div
              data-testid="dev-coverage"
              className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2"
            >
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-lg font-bold tabular-nums text-sidebar-foreground">
                  {doneModules}
                </span>
                <span className="text-2xs text-sidebar-foreground/55">/ {totalModules} modules optimized</span>
              </div>
              <div className="mt-1 text-2xs leading-snug text-sidebar-foreground/60">
                {totalEntries} enhancements
                {lastDate ? (
                  <>
                    <br />· last <span className="font-mono font-semibold">{lastDate}</span>
                  </>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              data-testid="dev-sidebar-all"
              onClick={() => setModuleFilter(null)}
              className={[
                'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sidebar-foreground transition-colors',
                moduleFilter === null ? 'bg-sidebar-accent font-semibold' : 'hover:bg-sidebar-accent/60',
              ].join(' ')}
            >
              <span className="text-xs">All enhancements</span>
              <span className="font-mono text-2xs tabular-nums text-sidebar-foreground/60">{totalEntries}</span>
            </button>

            <div className="flex flex-col gap-0.5">
              {stats.map(({ module, count, lastDate: last }) => {
                const done = count > 0
                const active = moduleFilter === module
                return (
                  <button
                    key={module}
                    type="button"
                    data-testid={`dev-sidebar-module-${module}`}
                    data-done={done ? 'true' : 'false'}
                    onClick={() => selectModule(module)}
                    aria-pressed={active}
                    className={[
                      'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                      active
                        ? 'border-sidebar-primary bg-sidebar-accent'
                        : 'border-transparent hover:bg-sidebar-accent/60',
                    ].join(' ')}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
                    ) : (
                      <Circle className="h-3 w-3 shrink-0 text-sidebar-foreground/30" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate font-mono text-xs ${
                            done ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground/50'
                          }`}
                        >
                          {module}
                        </span>
                        {done ? (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums text-primary">
                            {count}
                          </span>
                        ) : (
                          <span className="font-mono text-2xs text-sidebar-foreground/40">0</span>
                        )}
                      </div>
                      <span className="font-mono text-2xs tabular-nums text-sidebar-foreground/50">
                        {last ? `last ${last}` : 'no job done yet'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

    </div>
  )
}
