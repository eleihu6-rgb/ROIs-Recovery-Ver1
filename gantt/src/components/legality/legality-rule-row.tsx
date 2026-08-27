import { useState } from 'react'
import { Maximize2, Trash2 } from 'lucide-react'
import { LegalityParamTable } from './legality-param-table'
import { LegalityParamDialog } from './legality-param-dialog'
import { LegalityParamTableEditor } from './legality-param-table-editor'
import { RuleInlineCell } from './rule-inline-cell'
import { usePermission } from '@/hooks/use-permission'
import { useLegalityStore } from '@/stores/legality-store'
import type { LegalityRule, UpdateRuleMetaRequest } from '@/types/legality'

/** "8002/006 - Maximum Flight Time" — kept for search filtering in the parent view. */
export const ruleDisplayName = (rule: LegalityRule): string => {
  const code = `${rule.function}/${rule.instance ?? ''}`
  return rule.description ? `${code} - ${rule.description}` : code
}

interface Props {
  rule: LegalityRule
  /** When provided (admin, Rule Sets mgmt), renders a Remove-from-set action. */
  onRemove?: (rule: LegalityRule) => void
}

export const LegalityRuleRow = ({ rule, onRemove }: Props) => {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const key = `${rule.function}-${rule.instance ?? ''}`
  const { canAccessCtl } = usePermission()
  // BTN_EDIT_META covers /api/legality/rule/*/meta (description, reference, category, severity);
  // BTN_EDIT_PARAM covers /api/legality/rule/*/params (the param table editor). Admin users
  // get all ctls via buildAdminContext() in the auth plugin.
  const canEditMeta = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_META')
  const canEditParams = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_PARAM')
  const recordParamSave = useLegalityStore((s) => s.recordParamSave)
  const updateRuleMeta = useLegalityStore((s) => s.updateRuleMeta)
  const paramCount = rule.paramJson?.tables.reduce((n, t) => n + t.header.length, 0) ?? 0

  const saveMeta = canEditMeta
    ? (patch: UpdateRuleMetaRequest) => updateRuleMeta(rule.id, patch)
    : undefined

  return (
    <>
      <tr
        data-testid={`legality-rule-row-${key}`}
        onDoubleClick={() => setExpanded((e) => !e)}
        title="Double-click to show / hide parameters"
        className={[
          'cursor-pointer select-none border-b border-border/40 transition-colors',
          expanded ? 'bg-muted/30' : 'hover:bg-muted/20',
        ].join(' ')}
      >
        {/* Col 1: Rule — function/instance code only */}
        <td className="py-2.5 pl-4 pr-3">
          <div data-testid={`legality-rule-name-${key}`} className="text-xs font-semibold text-foreground">
            {rule.function}/{rule.instance ?? ''}
          </div>
        </td>

        {/* Col 2: Description — inline editable (admin) */}
        <td
          data-testid={`legality-rule-description-${key}`}
          className="py-2.5 pr-3 max-w-[180px]"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <RuleInlineCell
            value={rule.description}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ description: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 3: Reference — inline editable */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.reference}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ reference: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 4: Category — inline editable */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.category}
            type="text"
            onSave={saveMeta ? (val) => saveMeta({ category: val }) : undefined}
            placeholder="—"
          />
        </td>

        {/* Col 5: Severity — inline editable select */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          <RuleInlineCell
            value={rule.severity}
            type="severity"
            onSave={saveMeta ? (val) => saveMeta({ severity: Number(val) as 1 | 2 | 3 }) : undefined}
          />
        </td>

        {/* Col 6: Updated by — stored directly on rule, without a users join */}
        <td className="max-w-[7rem] truncate whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
          {rule.updatedBy ?? '—'}
        </td>

        {/* Col 7: Param count */}
        <td className="whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
          {paramCount > 0 ? `${paramCount} param${paramCount === 1 ? '' : 's'}` : '—'}
        </td>

        {/* Col 8: Actions */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1" onDoubleClick={(e) => e.stopPropagation()}>
            <button
              data-testid={`legality-rule-edit-${key}`}
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {expanded ? 'Close' : 'Edit'}
            </button>
            <button
              data-testid={`legality-rule-popup-${key}`}
              onClick={() => setDialogOpen(true)}
              title="Open in window"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            {onRemove && (
              <button
                data-testid={`rule-set-remove-${key}`}
                onClick={() => onRemove(rule)}
                title="Remove from this set"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <LegalityParamDialog rule={rule} open={dialogOpen} onClose={() => setDialogOpen(false)} />
        </td>
      </tr>

      {/* Inline params row — colSpan must match the 8 columns above */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-muted/10 p-0">
            {canEditParams && rule.paramJson ? (
              <div data-testid={`legality-params-${key}`}>
                <LegalityParamTableEditor
                  ruleId={rule.id}
                  paramJson={rule.paramJson}
                  fn={rule.function}
                  inst={rule.instance}
                  onSaved={(result) => recordParamSave(rule.id, result)}
                />
              </div>
            ) : (
              <LegalityParamTable paramJson={rule.paramJson} fn={rule.function} inst={rule.instance} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}
