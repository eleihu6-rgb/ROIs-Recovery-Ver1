// gantt/src/components/composition/rank-option-matrix.tsx
import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { notify } from '@/utils/notify'

export const RankOptionMatrix = () => {
  const ranks         = useCompositionStore((s) => s.ranks)
  const displayRanks  = useCompositionStore((s) => s.displayRanks)
  const displayOptions = useCompositionStore((s) => s.displayOptions)
  const rankLoading   = useCompositionStore((s) => s.rankLoading)
  const setCell       = useCompositionStore((s) => s.setCell)
  const addRank       = useCompositionStore((s) => s.addRank)
  const deleteRank    = useCompositionStore((s) => s.deleteRank)
  const addOption     = useCompositionStore((s) => s.addOption)
  const deleteOption  = useCompositionStore((s) => s.deleteOption)

  // Which cell is being edited: "rank:optionIdx" key
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingKey) inputRef.current?.focus()
  }, [editingKey])

  const cellKey = (rank: string, opt: number) => `${rank}:${opt}`

  const getCellValue = (rank: string, opt: number): number | null => {
    const row = ranks.find((r) => r.rank === rank && r.options === opt)
    return row?.planValue ?? null
  }

  const startEdit = (rank: string, opt: number) => {
    const val = getCellValue(rank, opt)
    setEditingKey(cellKey(rank, opt))
    setEditVal(val !== null ? String(val) : '')
  }

  const commitEdit = async (rank: string, opt: number) => {
    const trimmed = editVal.trim()
    if (trimmed !== '' && isNaN(parseInt(trimmed, 10))) {
      notify.error('Please enter a valid number')
      return
    }
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10)
    const value = isNaN(parsed as number) ? null : parsed
    try {
      await setCell(rank, opt, value)
      setEditingKey(null)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Save failed')
      // Keep editing - user can retry
    }
  }

  const handleAddRank = () => {
    const code = prompt('Rank code (e.g. CA, FO, FA):')
    if (!code?.trim()) return
    const upper = code.trim().toUpperCase()
    if (displayRanks.includes(upper)) {
      notify.error('Rank already exists')
      return
    }
    addRank(upper)
  }

  const handleDeleteRank = async (rank: string) => {
    if (!confirm(`Delete rank "${rank}"? All values for this rank will be removed.`)) return
    try {
      await deleteRank(rank)
      notify.success(`Rank ${rank} deleted`)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleDeleteOption = async (optIdx: number) => {
    if (!confirm(`Delete option ${optIdx}?`)) return
    try {
      await deleteOption(optIdx)
      notify.success('Option deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (rankLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading ranks…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{displayOptions.length}</strong> options ·{' '}
          <strong className="text-foreground">{displayRanks.length}</strong> ranks
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleAddRank}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" /> Add Rank
          </button>
          <button
            onClick={addOption}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" /> Add Option
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {displayRanks.length === 0 && displayOptions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No ranks defined. Click "Add Rank" to start.
          </div>
        ) : (
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {/* Option label col */}
                <th className="sticky left-0 z-20 border border-border bg-card px-4 py-2 text-left text-2xs font-bold text-muted-foreground whitespace-nowrap min-w-[80px]">
                  Option
                </th>
                {/* Rank columns */}
                {displayRanks.map((rank) => (
                  <th key={rank} className="group border border-border bg-card px-3 py-2 text-center min-w-[80px] whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-xs font-bold text-primary">{rank}</span>
                      <button
                        onClick={() => void handleDeleteRank(rank)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        title={`Delete rank ${rank}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayOptions.map((optIdx) => (
                <tr key={optIdx} className="group/row">
                  {/* Option label */}
                  <td className="sticky left-0 z-10 border border-border bg-card/90 px-4 py-1 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>Option {optIdx}</span>
                      <button
                        onClick={() => void handleDeleteOption(optIdx)}
                        className="opacity-0 group-hover/row:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        title="Delete option"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  {/* Rank cells */}
                  {displayRanks.map((rank) => {
                    const key = cellKey(rank, optIdx)
                    const val = getCellValue(rank, optIdx)
                    const isEditing = editingKey === key

                    return (
                      <td
                        key={rank}
                        className="border border-border/60 text-center hover:bg-primary/5 cursor-pointer"
                        onClick={() => !isEditing && startEdit(rank, optIdx)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number"
                            min={0}
                            max={99}
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => void commitEdit(rank, optIdx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitEdit(rank, optIdx)
                              if (e.key === 'Escape') setEditingKey(null)
                              e.stopPropagation()
                            }}
                            className="w-16 rounded border border-primary bg-background px-2 py-1 text-center text-sm font-bold text-foreground focus:outline-none"
                          />
                        ) : val !== null ? (
                          <span className="block px-3 py-2 text-sm font-bold text-foreground">{val}</span>
                        ) : (
                          <span className="flex items-center justify-center px-3 py-2">
                            <span className="h-3.5 w-3.5 rounded border border-dashed border-muted-foreground/40 opacity-50" />
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 border-t border-border px-4 py-1.5 text-2xs text-muted-foreground/60">
        <span className="mr-1 inline-block h-3 w-3 rounded border border-dashed border-current align-middle" />
        Empty = rank not included in this option's plan
      </div>
    </div>
  )
}