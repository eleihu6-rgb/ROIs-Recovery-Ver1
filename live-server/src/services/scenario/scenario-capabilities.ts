export type ScenarioPaneType = 'roster' | 'pairing' | 'flight'

export interface GanttCapabilities {
  panes: ScenarioPaneType[]          // allowed panes
  defaultPanes: ScenarioPaneType[]   // panes shown on first open (subset of panes)
  roster: { canAssign: boolean; canRemove: boolean; canReassign: boolean }
  pairing: { canEditSegments: boolean }
}

/** Code fallback (used when dictionary is empty). RO roster edit enabled in P3; PO/TO roster + all canEditSegments stay false (P4). */
const FALLBACK: Record<string, GanttCapabilities> = {
  RO: { panes: ['roster', 'pairing', 'flight'], defaultPanes: ['roster', 'pairing'],
        roster: { canAssign: true, canRemove: true, canReassign: true }, pairing: { canEditSegments: false } },
  PO: { panes: ['pairing', 'flight'], defaultPanes: ['pairing', 'flight'],
        roster: { canAssign: false, canRemove: false, canReassign: false }, pairing: { canEditSegments: false } },
  TO: { panes: [], defaultPanes: [],
        roster: { canAssign: false, canRemove: false, canReassign: false }, pairing: { canEditSegments: false } },
}

export function capabilitiesFromDict(
  rows: { code: string | null; codeValue: string | null }[],
  fileType: string,
): GanttCapabilities {
  const fb = FALLBACK[fileType] ?? FALLBACK.RO
  if (!rows || rows.length === 0) return fb
  const map = new Map(rows.filter((r) => r.code).map((r) => [r.code as string, r.codeValue ?? '']))
  const list = (k: string, d: ScenarioPaneType[]): ScenarioPaneType[] => {
    const v = map.get(k); if (v == null) return d
    return v.split(',').map((s) => s.trim()).filter(Boolean) as ScenarioPaneType[]
  }
  const bool = (k: string, d: boolean): boolean => {
    const v = map.get(k); return v == null ? d : (v === '1' || v.toLowerCase() === 'true')
  }
  return {
    panes: list('panes', fb.panes),
    defaultPanes: list('defaultPanes', fb.defaultPanes),
    roster: {
      canAssign: bool('canAssign', fb.roster.canAssign),
      canRemove: bool('canRemove', fb.roster.canRemove),
      canReassign: bool('canReassign', fb.roster.canReassign),
    },
    pairing: { canEditSegments: bool('canEditSegments', fb.pairing.canEditSegments) },
  }
}
