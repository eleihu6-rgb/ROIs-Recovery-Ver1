import { useReducer, useCallback } from 'react'
import { Plus, Pencil, Copy, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@rois/ui'
import { editorReducer, initEditorState } from './param-editor-reducer'
import { ParamCellInput } from './param-cell-input'
import { ParamChangeLogPanel } from './param-change-log-panel'
import { ParamRowDialog } from './param-row-dialog'
import { detectColumnFormat, getColumnTooltip, isDraftValid } from '@/utils/param-format'
import { legalityApi } from '@/services/legality-api'
import { notify } from '@/utils/notify'
import type { LegalityParamJson, UpdateRuleParamsResult } from '@/types/legality'
import type { CellFormat } from '@/utils/param-format'

const APPLICABILITY_RE = /^(bases?|ranks?|fleets?|teams?|crew teams?)$/i

interface Props {
  ruleId: number
  paramJson: LegalityParamJson
  fn: number
  inst: string | null
  scrollMode?: 'local' | 'parent'
  /** Called after a successful save with the full server result (param JSON + recheck impact). */
  onSaved: (result: UpdateRuleParamsResult) => void
}

/**
 * Editable legality param tables. Leftmost "Row" column is UI-only (1-based);
 * not written into param_json / Save payload.
 */
export const LegalityParamTableEditor = ({ ruleId, paramJson, fn, inst, scrollMode = 'local', onSaved }: Props) => {
  const key = `${fn}-${inst ?? ''}`
  const [state, dispatch] = useReducer(editorReducer, paramJson.tables, initEditorState)

  const handleSaveAll = useCallback(async () => {
    dispatch({ type: 'BEGIN_SAVE' })
    try {
      const result = await legalityApi.updateRuleParams(ruleId, { tables: state.tables })
      dispatch({ type: 'SAVE_SUCCESS' })
      onSaved(result)
      notify.success('Parameters saved')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      dispatch({ type: 'SAVE_ERROR', error: msg })
      notify.error(msg)
    }
  }, [ruleId, state.tables, onSaved])

  return (
    <TooltipProvider delayDuration={300}>
    <div
      data-testid={`legality-params-editor-${key}`}
      className={[
        'flex w-full min-w-0 gap-3',
        // Dialog (parent scroll): compact vertical pad and no extra horizontal inset.
        // Inline expand keeps px-4 to match surrounding page gutters.
        scrollMode === 'parent' ? 'min-h-0 flex-1 px-0 py-1' : 'px-4 py-3',
      ].join(' ')}
    >
      {/* Tables — parent mode: own X+Y scroll; CHANGES stays pinned as sibling */}
      <div
        data-testid={`legality-param-table-scroll-${key}`}
        className={[
          'flex min-w-0 flex-1 flex-col gap-3',
          scrollMode === 'parent' ? 'min-h-0 overflow-auto' : '',
        ].join(' ')}
      >
        {state.tables.map((table, ti) => {
          const colFormats: CellFormat[] = table.header.map((h, ci) =>
            detectColumnFormat(h, table.rows.map((r) => r[ci] ?? '')),
          )
          const isWide = table.header.length > 12

          return (
            <div
              key={ti}
              className={[
                // Parent scroll mode: grow with the wide table so the card border
                // wraps the full content (otherwise the right border sits mid-table
                // and looks like a vertical splitter when columns overflow).
                scrollMode === 'parent' ? 'w-max min-w-full overflow-visible' : 'overflow-x-auto',
                'rounded-md border border-border',
              ].join(' ')}
            >
              {state.tables.length > 1 && (
                <div className="border-b border-border bg-card px-3 py-1.5 text-2xs font-semibold text-foreground">
                  Table {ti + 1}
                </div>
              )}
              <table
                data-testid={`legality-param-table-${key}-${ti}`}
                className="min-w-full border-collapse"
              >
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th
                      data-testid={`legality-param-rownum-col-${key}-${ti}`}
                      className="whitespace-nowrap px-2.5 py-1.5 text-left text-3xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      Row
                    </th>
                    {table.header.map((h, ci) => {
                      const isApp = APPLICABILITY_RE.test(h)
                      const tip = getColumnTooltip(h, colFormats[ci] ?? 'text')
                      return (
                        <th
                          key={ci}
                          data-testid={`legality-param-col-${key}-${ti}-${ci}`}
                          className={[
                            'whitespace-nowrap px-2.5 py-1.5 text-left text-3xs font-bold uppercase tracking-wide',
                            isApp ? 'bg-primary/5 text-primary/80' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">{h}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px] text-xs">
                              {tip}
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      )
                    })}
                    <th className="whitespace-nowrap px-2.5 py-1.5 text-center text-3xs font-bold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => {
                    const isEditingThisRow =
                      state.editingCell?.tableIdx === ti && state.editingCell?.rowIdx === ri
                    const isDeletingThisRow =
                      state.deletingRow?.tableIdx === ti && state.deletingRow?.rowIdx === ri
                    const rowNumCell = (
                      <td
                        data-testid={`legality-param-rownum-${key}-${ti}-${ri}`}
                        className="whitespace-nowrap px-2.5 py-1.5 font-mono text-2xs tabular-nums text-muted-foreground"
                      >
                        {ri + 1}
                      </td>
                    )

                    if (isDeletingThisRow) {
                      return (
                        <tr
                          key={ri}
                          data-testid={`legality-param-row-${key}-${ti}-${ri}`}
                          className="border-b border-border/40 bg-destructive/5"
                        >
                          {rowNumCell}
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2.5 py-1.5 font-mono text-2xs tabular-nums text-muted-foreground opacity-50">
                              {cell}
                            </td>
                          ))}
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-2xs font-semibold text-destructive">Delete?</span>
                              <button
                                data-testid={`legality-param-delete-confirm-${key}-${ti}-${ri}`}
                                onClick={() => dispatch({ type: 'CONFIRM_DELETE' })}
                                className="rounded bg-destructive px-2 py-0.5 text-2xs font-bold text-white hover:bg-destructive/90"
                              >
                                Yes, delete
                              </button>
                              <button
                                data-testid={`legality-param-delete-cancel-${key}-${ti}-${ri}`}
                                onClick={() => dispatch({ type: 'CANCEL_DELETE' })}
                                className="rounded border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    if (isEditingThisRow) {
                      const draft = state.editingCell!.draft
                      const valid = isDraftValid(draft, colFormats)
                      return (
                        <tr
                          key={ri}
                          data-testid={`legality-param-row-${key}-${ti}-${ri}`}
                          className="border-b border-border/40 bg-amber-50"
                        >
                          {rowNumCell}
                          {table.header.map((h, ci) => (
                            <td key={ci} className={`px-2 py-1 ${APPLICABILITY_RE.test(h) ? 'bg-primary/[0.03]' : ''}`}>
                              <ParamCellInput
                                data-testid={`legality-param-cell-input-${key}-${ti}-${ri}-${ci}`}
                                value={draft[ci] ?? ''}
                                format={colFormats[ci] ?? 'text'}
                                onChange={(v) => dispatch({ type: 'UPDATE_DRAFT', colIdx: ci, value: v })}
                              />
                            </td>
                          ))}
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-1">
                              <button
                                data-testid={`legality-param-confirm-edit-${key}-${ti}-${ri}`}
                                onClick={() => dispatch({ type: 'CONFIRM_EDIT' })}
                                disabled={!valid}
                                className="inline-flex h-6 w-6 items-center justify-center rounded bg-green-600 text-white text-xs font-bold disabled:opacity-40 hover:bg-green-700"
                              >
                                ✓
                              </button>
                              <button
                                data-testid={`legality-param-cancel-edit-${key}-${ti}-${ri}`}
                                onClick={() => dispatch({ type: 'CANCEL_EDIT' })}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground text-xs hover:bg-muted"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={ri}
                        data-testid={`legality-param-row-${key}-${ti}-${ri}`}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                      >
                        {rowNumCell}
                        {table.header.map((h, ci) => (
                          <td
                            key={ci}
                            className={[
                              'whitespace-nowrap px-2.5 py-1.5 font-mono text-2xs tabular-nums text-foreground',
                              APPLICABILITY_RE.test(h) ? 'bg-primary/[0.03]' : '',
                            ].join(' ')}
                          >
                            {row[ci] ?? ''}
                          </td>
                        ))}
                        <td className="px-2.5 py-1.5">
                          <div className="flex items-center gap-0.5">
                            <button
                              data-testid={`legality-param-edit-${key}-${ti}-${ri}`}
                              title="Edit row"
                              onClick={() => isWide
                                ? dispatch({ type: 'BEGIN_DIALOG_EDIT', tableIdx: ti, rowIdx: ri })
                                : dispatch({ type: 'BEGIN_INLINE_EDIT', tableIdx: ti, rowIdx: ri })
                              }
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-primary hover:bg-muted"
                            >
                              <Pencil className="h-3 w-3 shrink-0" />
                            </button>
                            <button
                              data-testid={`legality-param-copy-${key}-${ti}-${ri}`}
                              title="Copy row"
                              onClick={() => dispatch({ type: 'COPY_ROW', tableIdx: ti, rowIdx: ri })}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-600 hover:bg-muted"
                            >
                              <Copy className="h-3 w-3 shrink-0" />
                            </button>
                            <button
                              data-testid={`legality-param-delete-${key}-${ti}-${ri}`}
                              title="Delete row"
                              onClick={() => dispatch({ type: 'BEGIN_DELETE', tableIdx: ti, rowIdx: ri })}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-destructive hover:bg-muted"
                            >
                              <Trash2 className="h-3 w-3 shrink-0" />
                            </button>
                            <button
                              data-testid={`legality-param-move-up-${key}-${ti}-${ri}`}
                              title="Move up"
                              onClick={() => dispatch({ type: 'MOVE_ROW', tableIdx: ti, rowIdx: ri, direction: 'up' })}
                              disabled={ri === 0}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              <ChevronUp className="h-3 w-3 shrink-0" />
                            </button>
                            <button
                              data-testid={`legality-param-move-down-${key}-${ti}-${ri}`}
                              title="Move down"
                              onClick={() => dispatch({ type: 'MOVE_ROW', tableIdx: ti, rowIdx: ri, direction: 'down' })}
                              disabled={ri === table.rows.length - 1}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              <ChevronDown className="h-3 w-3 shrink-0" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Add Row */}
              <div className="px-2.5 py-2">
                <button
                  data-testid={`legality-param-add-row-${key}-${ti}`}
                  onClick={() => dispatch({ type: 'ADD_ROW', tableIdx: ti })}
                  className="flex items-center gap-1.5 rounded border border-dashed border-primary/40 px-3 py-1 text-xs text-primary hover:border-primary hover:bg-primary/5"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Add Row
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Change Log Panel — shrink-0 sibling; stays at dialog right while tables scroll X */}
      <div className="shrink-0 self-start">
        <ParamChangeLogPanel
          history={state.history}
          saving={state.saving}
          saveError={state.saveError}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onSaveAll={handleSaveAll}
        />
      </div>

      {/* Dialog for wide (>12-col) rules */}
      {state.editingRowDialog && (
        <ParamRowDialog
          editing={state.editingRowDialog}
          header={state.tables[state.editingRowDialog.tableIdx].header}
          columnFormats={(() => {
            const t = state.tables[state.editingRowDialog.tableIdx]
            return t.header.map((h, ci) =>
              detectColumnFormat(h, t.rows.map((r) => r[ci] ?? '')),
            )
          })()}
          ruleName={`${fn}/${inst ?? ''}`}
          onUpdate={(ci, v) => dispatch({ type: 'UPDATE_DIALOG_DRAFT', colIdx: ci, value: v })}
          onConfirm={() => dispatch({ type: 'CONFIRM_DIALOG_EDIT' })}
          onCancel={() => dispatch({ type: 'CANCEL_DIALOG_EDIT' })}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
