import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  FlaskConical, Plus, Play, Wand2, Trash2, Download, ChevronRight, ChevronDown,
  ShieldAlert, FileArchive, Layers, CheckCircle2, XCircle, Clock, AlertTriangle,
  User, Bot, Flame, RefreshCw, Search, BarChart3, ListChecks, AlertCircle, BookOpen,
} from 'lucide-react'
import { notify } from '@/utils/notify'
import { regressionApi } from '@/services/regression-api'
import { useRegressionUiStore } from '@/stores/regression-ui-store'
import type { RegressionTest, RunScope, ApplyGateError, EntityIntent } from '@/types/regression'
import { AddTestDialog, type AddTestData } from './add-test-dialog'
import { RegressionInfo } from './regression-info'
import { RunStatusBar } from './run-status-bar'
import { useRunPoll, type ActiveRun } from './use-run-poll'
import { VersionHistory } from './version-history'

// ─── helpers ─────────────────────────────────────────────────────────────────

interface GeneratePreview {
  id: number
  code: string
  issues: string[]
  questions: string[]
}

const fmtMs = (ms: number | null): string => {
  if (ms == null) return '—'
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`
}

/** Compact relative time ("7h ago") so it never overflows the narrow Last Run column. */
const fmtAgo = (iso: string | null): string => {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const failPct = (t: RegressionTest): number =>
  t.run_count > 0 ? Math.round((t.fail_count / t.run_count) * 100) : 0

const avgMs = (t: RegressionTest): number | null =>
  t.run_count > 0 ? t.total_duration_ms / t.run_count : null

// ─── sub-components ──────────────────────────────────────────────────────────

const PriorityBadge = ({ priority }: { priority: string }) => {
  const style =
    priority === 'High'
      ? { background: '#fef2f2', color: '#dc2626' }
      : priority === 'Medium'
        ? { background: '#fffbeb', color: '#d97706' }
        : { background: '#f3f4f6', color: '#6b7280' }
  return (
    <span
      style={{ ...style, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}
    >
      {priority}
    </span>
  )
}

const SourceBadge = ({ source }: { source: 'AI' | 'User' }) =>
  source === 'AI' ? (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: '#f3e8ff', color: '#7c3aed',
        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      }}
    >
      <Bot size={10} />AI
    </span>
  ) : (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: '#dcfce7', color: '#15803d',
        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      }}
    >
      <User size={10} />User
    </span>
  )

const FlakinessBadge = ({ t }: { t: RegressionTest }) => {
  if (t.run_count === 0) return null
  const pct = failPct(t)
  const stable = pct === 0
  const high = pct >= 50
  const style = stable
    ? { background: '#dcfce7', color: '#15803d' }
    : high
      ? { background: '#fef2f2', color: '#dc2626' }
      : { background: '#fffbeb', color: '#d97706' }
  return (
    <span
      style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}
      title={`${t.fail_count} of ${t.run_count} runs failed`}
    >
      {!stable && <Flame size={10} />}
      {stable ? `${t.run_count}× stable` : `${pct}% fail`}
    </span>
  )
}

const QuarantineBadge = ({ t }: { t: RegressionTest }) =>
  t.quarantined ? (
    <span data-testid="row-quarantined" style={{ background: '#fffbeb', color: '#d97706', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 6 }}>
      quarantined
    </span>
  ) : null

const StatusIcon = ({ status }: { status: string | null }) => {
  if (status === 'pass') return <CheckCircle2 size={16} color="#16a34a" />
  if (status === 'fail') return <XCircle size={16} color="#dc2626" />
  return <Clock size={16} color="#9ca3af" />
}

// ─── stat card ───────────────────────────────────────────────────────────────

interface StatCardProps { icon: React.ReactNode; label: string; value: number | string; color: string; bg: string; testId?: string }
const StatCard = ({ icon, label, value, color, bg, testId }: StatCardProps) => (
  <div data-testid={testId} style={{
    background: 'white', border: '1px solid var(--color-border, #e5e7eb)',
    borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <div style={{ background: bg, borderRadius: 8, padding: '6px 8px', flexShrink: 0 }}>
      <div style={{ color }}>{icon}</div>
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    </div>
  </div>
)

// ─── entity disambiguation panel ─────────────────────────────────────────────

interface EntityDisambiguationPanelProps {
  testId: number
  entities: EntityIntent[]
  onAllConfirmed: (confirmed: EntityIntent[]) => void
  onDismissAll: () => void
}

const EntityDisambiguationPanel = ({ testId, entities, onAllConfirmed, onDismissAll }: EntityDisambiguationPanelProps) => {
  const [items, setItems] = useState<(EntityIntent & { step: 'intentional?' | 'intent-choice' })[]>(
    entities.map((e) => ({ ...e, intent: 'pending', step: 'intentional?' }))
  )
  const [confirmed, setConfirmed] = useState<EntityIntent[]>([])
  const [saving, setSaving] = useState(false)
  const [offerRegen, setOfferRegen] = useState(false)

  const pending = items.filter((it) => it.step === 'intentional?' || it.step === 'intent-choice')

  const handleYes = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, step: 'intent-choice' } : it))
  }

  const handleNo = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleConfirm = async (idx: number, intent: 'must_find' | 'empty_state') => {
    const item = items[idx]
    if (!item) return
    const updated: EntityIntent = { value: item.value, entity_type: item.entity_type, intent, condition_index: item.condition_index, context: item.context }
    const newConfirmed = [...confirmed, updated]
    const newItems = items.filter((_, i) => i !== idx)
    setConfirmed(newConfirmed)
    setItems(newItems)
    if (newItems.every((it) => it.step !== 'intentional?' && it.step !== 'intent-choice')) {
      // All resolved: save then show offer-regen state (do NOT call onAllConfirmed yet)
      setSaving(true)
      try {
        await regressionApi.updateEntityIntents(testId, newConfirmed)
        setOfferRegen(true)
      } catch {
        notify.error('Failed to save entity intents')
      } finally {
        setSaving(false)
      }
    }
  }

  if (offerRegen) {
    return (
      <div data-testid="entity-disambiguation-panel" style={{
        background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10,
        padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <CheckCircle2 size={14} color="#16a34a" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#374151', flex: 1 }}>
          Intent saved. Regenerate the test code to apply these rules?
        </span>
        <button
          type="button"
          data-testid="entity-regen-button"
          disabled={saving}
          onClick={() => { setOfferRegen(false); onAllConfirmed(confirmed) }}
          style={{ background: '#f3e8ff', border: '1px solid #ddd6fe', color: '#7c3aed', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
        >
          <Wand2 size={10} />Regenerate
        </button>
        <button type="button" onClick={onDismissAll} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>
          Dismiss
        </button>
      </div>
    )
  }

  if (pending.length === 0) return null

  return (
    <div data-testid="entity-disambiguation-panel" style={{
      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
      padding: '10px 14px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <AlertCircle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>Specific value detected</span>
      </div>
      {items.map((item, idx) => (
        item.step === 'intentional?' || item.step === 'intent-choice' ? (
          <div key={idx} data-testid="entity-item" style={{
            background: 'white', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12, fontWeight: 700, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, color: '#1f2937' }}>
                {item.value}
              </code>
              <span style={{ fontSize: 11, color: '#6b7280' }}>({item.entity_type})</span>
              {item.context && (
                <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>— in: "{item.context}"</span>
              )}
            </div>

            {item.step === 'intentional?' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#374151' }}>Is this intentional?</span>
                <button
                  type="button"
                  onClick={() => handleYes(idx)}
                  style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Yes, it is
                </button>
                <button
                  type="button"
                  data-testid="entity-intent-dismiss"
                  onClick={() => handleNo(idx)}
                  style={{ background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, padding: '2px 10px', borderRadius: 6, cursor: 'pointer' }}
                >
                  No, let me correct it
                </button>
              </div>
            )}

            {item.step === 'intent-choice' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>What should the UI do?</span>
                <label
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}
                  title="Condition A: the value should exist in the app data. The test fails if the result is empty — this exposes data gaps and catches AI illusions where the AI assumed data existed when it does not."
                >
                  <input
                    type="radio"
                    name={`entity-intent-${idx}`}
                    data-testid="entity-intent-A"
                    value="must_find"
                    style={{ marginTop: 2, flexShrink: 0 }}
                    onChange={() => {}}
                  />
                  <span style={{ fontSize: 11, color: '#374151' }}>
                    <strong>A — UI must return data</strong>
                    {' '}<span style={{ color: '#6b7280' }}>— test fails if result is empty.</span>
                    {' '}Use to verify data exists or expose data gaps and AI illusions.
                  </span>
                </label>
                <label
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}
                  title="Condition B: the value is intentionally absent. The test passes when the UI handles the absence gracefully — zero results, empty message, no crash."
                >
                  <input
                    type="radio"
                    name={`entity-intent-${idx}`}
                    data-testid="entity-intent-B"
                    value="empty_state"
                    style={{ marginTop: 2, flexShrink: 0 }}
                    onChange={() => {}}
                  />
                  <span style={{ fontSize: 11, color: '#374151' }}>
                    <strong>B — UI shows empty state</strong>
                    {' '}<span style={{ color: '#6b7280' }}>— test passes if handled correctly.</span>
                    {' '}Use when testing how the app behaves when data is absent.
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    data-testid="entity-intent-confirm"
                    disabled={saving}
                    onClick={() => {
                      const radios = document.querySelectorAll<HTMLInputElement>(`input[name="entity-intent-${idx}"]`)
                      const chosen = Array.from(radios).find((r) => r.checked)?.value as 'must_find' | 'empty_state' | undefined
                      if (!chosen) { notify.error('Please select an option (A or B)'); return }
                      void handleConfirm(idx, chosen)
                    }}
                    style={{ background: '#4f6ef7', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 6, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    Confirm intent
                  </button>
                  <button
                    type="button"
                    data-testid="entity-intent-dismiss"
                    onClick={() => handleNo(idx)}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null
      ))}
    </div>
  )
}

// ─── category section ────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: string
  tests: RegressionTest[]
  onRun: (ids: number[]) => void
  onGenerate: (t: RegressionTest, entityIntents?: EntityIntent[]) => void
  onDelete: (id: number) => void
  onToggleQuarantine: (t: RegressionTest) => void
  onConditionsChange: (id: number, conditions: string[]) => void
  expandedId: number | null
  setExpandedId: (id: number | null) => void
  lastRun: ActiveRun | null
}

const CategorySection = ({
  category, tests, onRun, onGenerate, onDelete, onToggleQuarantine, onConditionsChange,
  expandedId, setExpandedId, lastRun,
}: CategorySectionProps) => {
  const [collapsed, setCollapsed] = useState(false)
  const passing = tests.filter((t) => t.last_status === 'pass').length
  const failing = tests.filter((t) => t.last_status === 'fail').length

  return (
    <div style={{
      background: 'white', border: '1px solid var(--color-border, #e5e7eb)',
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Category header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '10px 16px', background: '#f8f9fb', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        {collapsed ? <ChevronRight size={15} color="#6b7280" /> : <ChevronDown size={15} color="#6b7280" />}
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{category}</span>
        <span style={{ fontSize: 12, background: 'white', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12, padding: '1px 8px', color: '#6b7280' }}>
          {tests.length}
        </span>
        {passing > 0 && (
          <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', fontWeight: 600, padding: '1px 8px', borderRadius: 12 }}>
            ✓ {passing}
          </span>
        )}
        {failing > 0 && (
          <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', fontWeight: 600, padding: '1px 8px', borderRadius: 12 }}>
            ✗ {failing}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRun(tests.filter((t) => t.spec_file !== 'manual').map((t) => t.id)) }}
          aria-label="Run all runnable tests in this category"
          title="Run all runnable tests in this category"
          style={{
            background: 'white', border: '1px solid #c7d2fe', color: '#4f6ef7',
            padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          }}
        >
          <Play size={11} />Run
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '92px 1fr 24px 72px 80px 156px',
            gap: 8, padding: '5px 16px',
            background: '#fafafa', borderBottom: '1px solid var(--color-border, #e5e7eb)',
          }}>
            {['ID', 'Title / Story', '', 'Duration', 'Last Run', 'Actions'].map((h) => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {tests.map((t) => (
            <TestRow
              key={t.id}
              t={t}
              onRun={() => onRun([t.id])}
              onGenerate={(entityIntents) => onGenerate(t, entityIntents)}
              onDelete={() => onDelete(t.id)}
              onToggleQuarantine={() => onToggleQuarantine(t)}
              onConditionsChange={(conditions) => onConditionsChange(t.id, conditions)}
              expanded={expandedId === t.id}
              onToggleExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
              lastRun={lastRun}
            />
          ))}
        </>
      )}
    </div>
  )
}

// Test titles carry our naming-convention id as a prefix, e.g.
// "Live-1001 — filters crew…" or "Data-5020 — …". Show that id instead of the
// raw DB row id (#1001) to avoid the duplication, and strip it from the story.
const TITLE_ID_RE = /^\s*([A-Za-z][A-Za-z0-9]*-\d{3,4})\s*[—–-]\s*(.+)$/
const parseTestTitle = (title: string): { code: string | null; story: string } => {
  const m = title.match(TITLE_ID_RE)
  return m ? { code: m[1], story: m[2].trim() } : { code: null, story: title }
}

// ─── test row ─────────────────────────────────────────────────────────────────

interface TestRowProps {
  t: RegressionTest
  onRun: () => void
  onGenerate: (entityIntents?: EntityIntent[]) => void
  onDelete: () => void
  onToggleQuarantine: () => void
  onConditionsChange: (conditions: string[]) => void
  expanded: boolean
  onToggleExpand: () => void
  lastRun: ActiveRun | null
}

const TestRow = ({ t, onRun, onGenerate, onDelete, onToggleQuarantine, onConditionsChange, expanded, onToggleExpand, lastRun }: TestRowProps) => {
  const rowBg =
    t.last_status === 'pass' ? '#f0fdf4'
      : t.last_status === 'fail' ? '#fef2f2'
        : 'white'

  const rowResult = lastRun?.results?.[String(t.id)]
  const avgDuration = avgMs(t)
  const { code, story } = parseTestTitle(t.title)

  // Conditions state (local edit buffer)
  const [conditionsEdit, setConditionsEdit] = useState(false)
  const [conditionsDraft, setConditionsDraft] = useState((t.conditions ?? []).join('\n'))
  const [conditionsSaving, setConditionsSaving] = useState(false)
  const [conditionsLocal, setConditionsLocal] = useState<string[]>(t.conditions ?? [])
  const [offerRegen, setOfferRegen] = useState(false)
  const [pendingEntities, setPendingEntities] = useState<EntityIntent[]>([])

  // Test story state (local edit buffer). 1 story : N conditions per test.
  const [storyEdit, setStoryEdit] = useState(false)
  const [storyDraft, setStoryDraft] = useState(t.story ?? '')
  const [storySaving, setStorySaving] = useState(false)
  const [storyLocal, setStoryLocal] = useState(t.story ?? '')

  const handleStorySave = async () => {
    const next = storyDraft.trim()
    setStorySaving(true)
    try {
      await regressionApi.updateStory(t.id, next)
      setStoryLocal(next)
      setStoryEdit(false)
    } catch {
      notify.error('Failed to save test story')
    } finally {
      setStorySaving(false)
    }
  }

  const handleConditionsSave = async () => {
    const lines = conditionsDraft.split('\n').map((l) => l.trim()).filter(Boolean)
    setConditionsSaving(true)
    try {
      await regressionApi.updateConditions(t.id, lines)
      setConditionsLocal(lines)
      onConditionsChange(lines)
      setConditionsEdit(false)
      setOfferRegen(true)
      // Auto-extract entities from saved conditions
      if (lines.length > 0) {
        try {
          const extracted = await regressionApi.extractEntities(t.id, lines)
          if (Array.isArray(extracted) && extracted.length > 0) {
            setPendingEntities(extracted.map((e) => ({ ...e, intent: 'pending' as const })))
          }
        } catch {
          // Entity extraction is best-effort; silently skip on failure
        }
      }
    } catch {
      notify.error('Failed to save conditions')
    } finally {
      setConditionsSaving(false)
    }
  }

  return (
    <>
      <div
        data-testid="regression-row"
        style={{
          display: 'grid', gridTemplateColumns: '92px 1fr 24px 72px 80px 156px',
          gap: 8, padding: '10px 16px', background: rowBg,
          borderBottom: '1px solid var(--color-border, #e5e7eb)', alignItems: 'center',
        }}
      >
        {/* ID + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            data-testid="row-expand"
            aria-label="Show versions and run rounds"
            title="Show versions and run rounds"
            onClick={onToggleExpand}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', display: 'flex' }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span data-testid="row-code" style={{ fontSize: 11, fontWeight: 700, color: '#4f6ef7', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} title={code ? `${code} (test #${t.id})` : `test #${t.id}`}>
            {code ?? `#${t.id}`}
          </span>
        </div>

        {/* Title + badges */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>
            {story}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <PriorityBadge priority={t.priority} />
            <SourceBadge source={t.source} />
            <FlakinessBadge t={t} />
            <QuarantineBadge t={t} />
            {t.fail_count > 0 && (
              <span data-testid="row-failcount" style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 6 }}>
                {t.fail_count}
              </span>
            )}
            {t.instability > 0 && (
              <span data-testid="row-instability" style={{ fontSize: 11, fontWeight: 600, color: '#d97706', background: '#fffbeb', padding: '2px 7px', borderRadius: 6 }}>
                {Math.round(t.instability * 100)}% unstable
              </span>
            )}
            {t.run_count > 0 && (
              <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                {t.run_count}× · avg {fmtMs(avgDuration != null ? avgDuration : null)}
              </span>
            )}
            {lastRun && rowResult?.has_trace && (
              <a
                data-testid="row-trace"
                href={regressionApi.traceUrl(lastRun.runId, t.id)}
                download
                title="Download Playwright trace for this run round"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#4f6ef7', textDecoration: 'none' }}
              >
                <FileArchive size={10} />trace
              </a>
            )}
          </div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <StatusIcon status={t.last_status} />
        </div>

        {/* Duration */}
        <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtMs(t.last_duration_ms)}
        </div>

        {/* Last run */}
        <div
          data-testid="row-lastrun"
          title={t.last_run_at ? new Date(t.last_run_at).toLocaleString() : undefined}
          style={{ fontSize: 12, color: '#6b7280', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {fmtAgo(t.last_run_at)}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          {t.spec_file !== 'manual' && (
            <button
              type="button"
              data-testid="row-run"
              aria-label="Run the latest version of this test"
              title="Run the latest version of this test"
              onClick={onRun}
              style={{
                background: '#f0f4ff', border: '1px solid #c7d2fe', color: '#4f6ef7',
                fontSize: 12, fontWeight: 600, padding: '4px 8px', borderRadius: 7,
                display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
              }}
            >
              <Play size={11} />Run
            </button>
          )}
          <button
            type="button"
            data-testid="row-generate"
            aria-label="Generate or regenerate Playwright for the active version"
            onClick={() => onGenerate()}
            title="Generate or regenerate Playwright for the active version"
            style={{ background: '#f3f4f6', border: 'none', color: '#6b7280', padding: '5px 7px', borderRadius: 7, cursor: 'pointer', display: 'flex' }}
          >
            <Wand2 size={13} />
          </button>
          <button
            type="button"
            data-testid="row-quarantine-toggle"
            aria-label={t.quarantined ? 'Release from quarantine' : 'Quarantine'}
            onClick={onToggleQuarantine}
            title="Quarantine excludes this test from Run All until it is stable"
            style={{
              background: t.quarantined ? '#fffbeb' : '#f3f4f6',
              border: 'none', color: t.quarantined ? '#d97706' : '#6b7280',
              padding: '5px 7px', borderRadius: 7, cursor: 'pointer', display: 'flex',
            }}
          >
            <ShieldAlert size={13} />
          </button>
          <button
            type="button"
            data-testid="row-delete"
            aria-label="Delete"
            onClick={onDelete}
            style={{ background: '#fef2f2', border: 'none', color: '#dc2626', padding: '5px 7px', borderRadius: 7, cursor: 'pointer', display: 'flex' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* ── Conditions section ── */}
          <div
            style={{
              background: '#f8f9fb', borderBottom: '1px solid var(--color-border, #e5e7eb)',
              padding: '10px 16px',
            }}
          >
            <div
              data-testid="story-conditions-grid"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}
            >
              {/* LEFT ── Test story (1 per test: what the test does) ── */}
              <div data-testid="story-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <BookOpen size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' }}>
                    Test story
                  </span>
                  <div style={{ flex: 1 }} />
                  {!storyEdit && (
                    <button
                      type="button"
                      data-testid="story-edit"
                      onClick={() => { setStoryDraft(storyLocal); setStoryEdit(true) }}
                      style={{ background: 'none', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {storyEdit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      value={storyDraft}
                      onChange={(e) => setStoryDraft(e.target.value)}
                      placeholder="What the test does — e.g. Opens the Crew filter, picks a rank, and applies it."
                      style={{ width: '100%', minHeight: 72, fontSize: 11, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border, #e5e7eb)', background: 'white', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setStoryEdit(false)}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: '#6b7280', cursor: 'pointer', padding: '3px 8px' }}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="story-save"
                        disabled={storySaving}
                        onClick={() => void handleStorySave()}
                        style={{ background: '#4f6ef7', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: storySaving ? 'default' : 'pointer', opacity: storySaving ? 0.6 : 1 }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    data-testid="story-text"
                    style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: storyLocal ? '#374151' : '#9ca3af', fontStyle: storyLocal ? 'normal' : 'italic' }}
                  >
                    {storyLocal || 'No story set — click Edit to describe what this test does.'}
                  </p>
                )}
              </div>

              {/* RIGHT ── Pass conditions (N per test: expected outcomes) ── */}
              <div data-testid="conditions-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ListChecks size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280' }}>
                    Pass conditions
                  </span>
                  <div style={{ flex: 1 }} />
                  {!conditionsEdit && (
                    <button
                      type="button"
                      data-testid="conditions-edit"
                      onClick={() => { setConditionsDraft(conditionsLocal.join('\n')); setConditionsEdit(true); setOfferRegen(false) }}
                      style={{ background: 'none', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {conditionsEdit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      value={conditionsDraft}
                      onChange={(e) => setConditionsDraft(e.target.value)}
                      placeholder="One condition per line, e.g. roster shows crew rows for the selected fleet"
                      style={{ width: '100%', minHeight: 72, fontSize: 11, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border, #e5e7eb)', background: 'white', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setConditionsEdit(false)}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: '#6b7280', cursor: 'pointer', padding: '3px 8px' }}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="conditions-save"
                        disabled={conditionsSaving}
                        onClick={() => void handleConditionsSave()}
                        style={{ background: '#4f6ef7', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: conditionsSaving ? 'default' : 'pointer', opacity: conditionsSaving ? 0.6 : 1 }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul data-testid="conditions-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {conditionsLocal.length === 0 ? (
                      <li style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>No conditions set — click Edit to add pass/fail conditions.</li>
                    ) : (
                      conditionsLocal.map((c, i) => (
                        <li key={i} data-testid="condition-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, color: '#374151' }}>
                          <CheckCircle2 size={11} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                          {c}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
            {offerRegen && !conditionsEdit && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#374151' }}>Conditions updated — regenerate code?</span>
                <button
                  type="button"
                  onClick={() => { setOfferRegen(false); onGenerate() }}
                  style={{ background: '#f3e8ff', border: '1px solid #ddd6fe', color: '#7c3aed', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  <Wand2 size={10} />Regenerate
                </button>
                <button type="button" onClick={() => setOfferRegen(false)}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>
                  Dismiss
                </button>
              </div>
            )}
            {pendingEntities.length > 0 && !conditionsEdit && (
              <EntityDisambiguationPanel
                testId={t.id}
                entities={pendingEntities}
                onAllConfirmed={(confirmedIntents) => {
                  setPendingEntities([])
                  setOfferRegen(false)
                  // Regenerate code with confirmed entity intents baked in
                  void onGenerate(confirmedIntents)
                }}
                onDismissAll={() => setPendingEntities([])}
              />
            )}
          </div>
          <VersionHistory testId={t.id} />
        </>
      )}
    </>
  )
}

// ─── main view ────────────────────────────────────────────────────────────────

export const RegressionView = () => {
  const [tests, setTests] = useState<RegressionTest[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState<GeneratePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<ActiveRun | null>(null)
  const [search, setSearch] = useState('')
  // Category filter is shared with the sidebar tree via the regression UI store.
  const filterCategory = useRegressionUiStore((s) => s.categoryFilter)
  const setFilterCategory = useRegressionUiStore((s) => s.setCategoryFilter)
  const setStoreCategories = useRegressionUiStore((s) => s.setCategories)
  const [filterPriority, setFilterPriority] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { tests: data } = await regressionApi.list()
      setTests(data ?? [])
      setError(null)
    } catch (e) {
      // AI 回归后端在部署环境（SIT/UAT）未随 nginx 暴露，404/连接失败属预期。
      // 不输出 console.error 噪音，展示清晰空态；后续由权限/部署控制该工具的可见性。
      const status = (e as { __status?: number })?.__status
      if (status === 404 || status === undefined) {
        setError('Regression backend not available in this environment.')
        setTests([])
      } else {
        console.error('[regression]', e)
        setError('Failed to load tests')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const onRunDone = useCallback((run: ActiveRun) => {
    setLastRun(run)
    if (run.status === 'done') {
      notify.success(`Run finished: ${run.passed} passed, ${run.failed} failed`)
      void refresh()
    }
  }, [refresh])

  const { run: activeRun, start: startPolling, dismiss: dismissRun } = useRunPoll(onRunDone)

  const startRun = useCallback(async (ids: number[], total: number) => {
    setLastRun(null)
    try {
      const { run_id } = await regressionApi.run(ids, { order: 'failing-first', scope: 'selected' })
      startPolling(run_id, total)
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Run failed to start')
    }
  }, [startPolling])

  const onImport = async () => {
    try {
      const { imported, skipped } = await regressionApi.importSpecs()
      notify.success(`Imported ${imported} tests (${skipped} already present)`)
      await refresh()
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Import failed')
    }
  }

  const onGenerate = async (t: RegressionTest, entityIntents?: EntityIntent[]) => {
    try {
      const res = await regressionApi.generate({
        title: t.title, description: t.description, category: t.category,
        conditions: t.conditions ?? [],
        ...(entityIntents && entityIntents.length > 0 ? { entity_intents: entityIntents } : {}),
      })
      if (res.code) setPreview({ id: t.id, code: res.code, issues: res.issues ?? [], questions: [] })
      else if (res.questions?.length) setPreview({ id: t.id, code: '', issues: [], questions: res.questions })
      else if (res.error) notify.error(res.error)
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Generate failed')
    }
  }

  const onRegenerate = async (t: RegressionTest) => {
    if (!preview) return
    try {
      const res = await regressionApi.generate({
        title: t.title, description: t.description, category: t.category,
        previous_code: preview.code, issues: preview.issues,
        conditions: t.conditions ?? [],
      })
      if (res.code) setPreview({ id: t.id, code: res.code, issues: res.issues ?? [], questions: [] })
      else if (res.error) notify.error(res.error)
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Regenerate failed')
    }
  }

  const onApply = async () => {
    if (!preview) return
    try {
      await regressionApi.applyGenerated(preview.id, preview.code)
      setPreview(null)
      await refresh()
    } catch (err) {
      const issues = (err as ApplyGateError).issues
      if (issues?.length) setPreview({ ...preview, issues })
    }
  }

  const onDelete = async (id: number) => {
    try {
      await regressionApi.remove(id)
      if (preview?.id === id) setPreview(null)
      await refresh()
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Delete failed')
    }
  }

  const onToggleQuarantine = async (t: RegressionTest) => {
    try {
      await regressionApi.setQuarantined(t.id, !t.quarantined)
      await refresh()
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Update failed')
    }
  }

  const onSave = async (data: AddTestData) => {
    await regressionApi.create(data)
    await refresh()
  }

  const onConditionsChange = useCallback((id: number, conditions: string[]) => {
    setTests((prev) => prev.map((t) => t.id === id ? { ...t, conditions } : t))
  }, [])

  // ── derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: tests.length,
    passing: tests.filter((t) => t.last_status === 'pass').length,
    failing: tests.filter((t) => t.last_status === 'fail').length,
    notRun: tests.filter((t) => t.last_status == null).length,
    highPriority: tests.filter((t) => t.priority === 'High').length,
    userAdded: tests.filter((t) => t.source === 'User').length,
    runCount: tests.filter((t) => t.run_count > 0).length,
  }), [tests])

  const coveragePct = stats.total > 0 ? Math.round((stats.runCount / stats.total) * 100) : 0

  const categories = useMemo(() => {
    const set = new Set(tests.map((t) => t.category))
    return ['', ...Array.from(set).sort()]
  }, [tests])

  // Publish per-category roll-ups to the shared store for the sidebar tree.
  // Group key matches the main list ('' → 'General') so tree ↔ list stay in sync.
  useEffect(() => {
    const map = new Map<string, { total: number; pass: number; fail: number }>()
    for (const t of tests) {
      const cat = t.category || 'General'
      const e = map.get(cat) ?? { total: 0, pass: 0, fail: 0 }
      e.total++
      if (t.last_status === 'pass') e.pass++
      else if (t.last_status === 'fail') e.fail++
      map.set(cat, e)
    }
    const summaries = Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name))
    setStoreCategories(summaries)
  }, [tests, setStoreCategories])

  // ── filtering ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tests
    const q = search.toLowerCase()
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || String(t.id).includes(q))
    if (filterCategory) list = list.filter((t) => (t.category || 'General') === filterCategory)
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority)
    if (filterSource) list = list.filter((t) => t.source === filterSource)
    if (filterStatus === 'pass') list = list.filter((t) => t.last_status === 'pass')
    else if (filterStatus === 'fail') list = list.filter((t) => t.last_status === 'fail')
    else if (filterStatus === 'pending') list = list.filter((t) => t.last_status == null)
    return list
  }, [tests, search, filterCategory, filterPriority, filterSource, filterStatus])

  const hasFilters = !!(search || filterCategory || filterPriority || filterSource || filterStatus)
  const clearFilters = () => { setSearch(''); setFilterCategory(''); setFilterPriority(''); setFilterSource(''); setFilterStatus('') }

  // group by category, sort fail-first within each
  const grouped = useMemo(() => {
    const map = new Map<string, RegressionTest[]>()
    for (const t of filtered) {
      const cat = t.category || 'General'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    // sort each bucket fail-first
    for (const [, rows] of map) {
      rows.sort((a, b) => b.fail_count - a.fail_count || b.run_count - a.run_count || a.id - b.id)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const runAll = () => {
    const base = hasFilters ? filtered : tests
    const runnable = base.filter((t) => t.spec_file !== 'manual' && !t.quarantined)
    if (runnable.length === 0) { notify.error('No runnable tests in current view'); return }
    void startRun(runnable.map((t) => t.id), runnable.length)
  }

  const applyBlocked = (preview?.issues.length ?? 0) > 0 || !preview?.code

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            background: 'linear-gradient(135deg, #4f6ef7, #7c3aed)',
            borderRadius: 10, padding: '8px 10px', flexShrink: 0,
          }}>
            <FlaskConical size={18} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: -0.4,
              background: 'linear-gradient(135deg, #4f6ef7, #7c3aed)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Regression Tests
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
              AI-powered playwright test management — Ver:B50/F93
            </div>
          </div>
          <RegressionInfo />
        </div>

        {/* ── Stats dashboard ── */}
        {!loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard testId="stat-total" icon={<Layers size={16} />} label="Total Tests" value={stats.total} color="#4f6ef7" bg="#eef1fe" />
            <StatCard icon={<CheckCircle2 size={16} />} label="Passing" value={stats.passing} color="#16a34a" bg="#dcfce7" />
            <StatCard testId="stat-fail" icon={<XCircle size={16} />} label="Failing" value={stats.failing} color="#dc2626" bg="#fee2e2" />
            <StatCard icon={<Clock size={16} />} label="Not Run" value={stats.notRun} color="#9ca3af" bg="#f3f4f6" />
            <StatCard icon={<AlertTriangle size={16} />} label="High Priority" value={stats.highPriority} color="#d97706" bg="#fffbeb" />
            <StatCard testId="stat-user" icon={<User size={16} />} label="User Added" value={stats.userAdded} color="#7c3aed" bg="#f3e8ff" />
          </div>
        )}

        {/* ── Coverage bar ── */}
        {!loading && !error && stats.total > 0 && (
          <div style={{
            background: 'white', border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 12, padding: '12px 18px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <BarChart3 size={15} color="#4f6ef7" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flexShrink: 0 }}>Coverage</span>
            <div style={{ flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${coveragePct}%`, height: '100%',
                background: 'linear-gradient(90deg, #4f6ef7, #7c3aed)', borderRadius: 4,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4f6ef7', flexShrink: 0 }}>{coveragePct}%</span>
            <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{stats.runCount} of {stats.total} tests run</span>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '0 0 220px' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search tests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', paddingLeft: 30, paddingRight: 10, height: 34,
                fontSize: 12, border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: 8, background: 'white', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, background: 'white' }}
          >
            <option value="">All Categories</option>
            {categories.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Priority filter */}
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, background: 'white' }}>
            <option value="">All Priorities</option>
            {['High', 'Medium', 'Low'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Source filter */}
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, background: 'white' }}>
            <option value="">All Sources</option>
            {['AI', 'User'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Status filter */}
          <select data-testid="filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, background: 'white' }}>
            <option value="">All Status</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="pending">Not Run</option>
          </select>

          <div style={{ flex: 1 }} />

          {/* Refresh */}
          <button type="button" onClick={() => void refresh()}
            style={{ background: 'white', border: '1px solid var(--color-border, #e5e7eb)', color: '#6b7280', padding: '0 10px', height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={13} />Refresh
          </button>

          {/* Import */}
          <button
            type="button"
            data-testid="import-specs"
            onClick={onImport}
            aria-label="Import Playwright specs from e2e/tests"
            title="Import Playwright specs from e2e/tests; safe to repeat"
            style={{
              background: 'white', border: '1px solid #c7d2fe', color: '#4f6ef7',
              padding: '0 12px', height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Download size={13} />Import specs
          </button>

          {/* Add Test */}
          <button
            type="button"
            data-testid="add-test-open"
            onClick={() => setAddOpen(true)}
            title="Create a test from a plain-English story — no coding required"
            style={{
              background: '#f3e8ff', border: '1px solid #ddd6fe', color: '#7c3aed',
              padding: '0 14px', height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={13} />Add Test
          </button>

          {/* Run All — respects active filters */}
          <button
            type="button"
            data-testid="run-failing-first"
            onClick={runAll}
            aria-label={hasFilters ? `Run ${filtered.filter((t) => t.spec_file !== 'manual' && !t.quarantined).length} filtered tests` : 'Run all non-quarantined tests, failing cases first'}
            title={hasFilters ? `Run ${filtered.filter((t) => t.spec_file !== 'manual' && !t.quarantined).length} filtered tests (clear filters to run all)` : 'Run all non-quarantined tests, failing cases first'}
            style={{
              background: 'linear-gradient(135deg, #4f6ef7, #7c3aed)', color: 'white',
              border: 'none', padding: '0 16px', height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Play size={13} />{hasFilters ? `Run ${filtered.filter((t) => t.spec_file !== 'manual' && !t.quarantined).length}` : 'Run All'}
          </button>
        </div>

        {/* Filter summary */}
        {hasFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: '#6b7280' }}>
            <Search size={13} />
            Showing {filtered.length} of {tests.length} tests
            <button type="button" onClick={clearFilters}
              style={{ background: 'none', border: 'none', color: '#4f6ef7', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              Clear all filters
            </button>
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9ca3af', fontSize: 13 }}>
            Loading…
          </div>
        ) : error ? (
          <div data-testid="regression-error" style={{ textAlign: 'center', padding: '40px 16px', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        ) : grouped.length === 0 ? (
          <div data-testid="regression-empty" style={{
            textAlign: 'center', padding: '48px 16px',
            background: 'white', border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <FlaskConical size={36} color="#9ca3af" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {hasFilters ? 'No tests match your filters' : 'No regression tests yet'}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {hasFilters
                ? 'Try adjusting your filters or search query.'
                : 'Click "Import specs" to load the existing test catalog, or "Add Test" to write one in plain English.'}
            </div>
            {!hasFilters && (
              <button
                type="button"
                data-testid="import-specs-empty"
                onClick={onImport}
                style={{
                  background: '#f0f4ff', border: '1px solid #c7d2fe', color: '#4f6ef7',
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Download size={14} />Import specs
              </button>
            )}
          </div>
        ) : (
          <div data-testid="regression-list">
            {grouped.map(([category, rows]) => (
              <CategorySection
                key={category}
                category={category}
                tests={rows}
                onRun={(ids) => void startRun(ids, ids.length)}
                onGenerate={(t, entityIntents) => void onGenerate(t, entityIntents)}
                onDelete={(id) => void onDelete(id)}
                onToggleQuarantine={onToggleQuarantine}
                onConditionsChange={onConditionsChange}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                lastRun={lastRun}
              />
            ))}
          </div>
        )}

        {/* ── Generated-code preview ── */}
        {preview && (
          <div data-testid="generate-preview" style={{
            background: 'white', border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 12, padding: 14, marginTop: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {preview.questions.length > 0 ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  Clarify before generating:
                </div>
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: '#374151' }}>
                  {preview.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            ) : (
              <pre style={{
                maxHeight: 160, overflowY: 'auto', fontSize: 11, lineHeight: 1.5,
                background: '#f8f9fb', borderRadius: 8, padding: '10px 12px', margin: 0,
                fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{preview.code}</pre>
            )}
            {preview.issues.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {preview.issues.map((issue, i) => (
                  <span key={i} data-testid="generate-issue"
                    style={{ background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>
                    {issue}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                data-testid="apply-generated"
                disabled={applyBlocked}
                onClick={onApply}
                style={{
                  background: applyBlocked ? '#f3f4f6' : '#4f6ef7', color: applyBlocked ? '#9ca3af' : 'white',
                  border: 'none', padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  cursor: applyBlocked ? 'default' : 'pointer',
                }}
              >
                Apply
              </button>
              {preview.issues.length > 0 && (
                <button
                  type="button"
                  data-testid="regenerate-with-fixes"
                  onClick={() => { const t = tests.find((x) => x.id === preview.id); if (t) void onRegenerate(t) }}
                  style={{
                    background: '#f3e8ff', border: '1px solid #ddd6fe', color: '#7c3aed',
                    padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                  }}
                >
                  <Wand2 size={12} />Regenerate with fixes
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}
              >
                Dismiss
              </button>
              {applyBlocked && preview.issues.length > 0 && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Issues block Apply — use Regenerate with fixes.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Run status bar (bottom) ── */}
      {(activeRun || lastRun?.status === 'error') && (
        <RunStatusBar
          run={activeRun ?? (lastRun as ActiveRun)}
          onDismiss={() => { dismissRun(); setLastRun(null) }}
        />
      )}

      <AddTestDialog open={addOpen} onOpenChange={setAddOpen} onSave={onSave} />
    </div>
  )
}
