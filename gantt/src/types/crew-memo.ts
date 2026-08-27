/** A range-based crew memo (mirrors live-server MemoDTO). */
export interface CrewMemo {
  id: number
  crewId: string
  strDtLoc: string | null
  endDtLoc: string | null
  memo: string | null
  name: string | null
  /** 1=manual, 2=warning, 3=system/bot (PA-removal) */
  type: number | null
  status: string
  rosterId: number | null
}

export interface CrewMemoInput {
  id?: number
  crewId: string
  strDtLoc: string
  endDtLoc: string
  memo: string
  name?: string
  type?: number
  rosterId?: number | null
}

export interface PaRemovalResult {
  written: number
  crewCount: number
  byCrew: Record<string, number>
}
