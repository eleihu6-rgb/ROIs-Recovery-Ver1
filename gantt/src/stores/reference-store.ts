import { create } from 'zustand'
import {
  referenceApi,
  type BaseOption,
  type RankOption,
  type FleetOption,
  type PairingTypeOption,
  type PairingAssignmentGroupOption,
  type DivisionOption,
} from '@/services/reference-api'

interface ReferenceStore {
  bases: BaseOption[]
  ranks: RankOption[]
  fleets: FleetOption[]
  pairingTypes: PairingTypeOption[]
  pairingAssignmentGroups: PairingAssignmentGroupOption[]
  divisions: DivisionOption[]
  loading: boolean
  loaded: boolean
  load: () => Promise<void>
}

export const useReferenceStore = create<ReferenceStore>((set, get) => ({
  bases: [],
  ranks: [],
  fleets: [],
  pairingTypes: [],
  pairingAssignmentGroups: [],
  divisions: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const [bases, ranks, fleets, pairingTypes, pairingAssignmentGroups, divisions] = await Promise.all([
        referenceApi.listBases(),
        referenceApi.listRanks(),
        referenceApi.listFleets(),
        referenceApi.listPairingTypes(),
        referenceApi.listPairingAssignmentGroups(),
        referenceApi.listDivisions(),
      ])
      set({ bases, ranks, fleets, pairingTypes, pairingAssignmentGroups, divisions, loaded: true })
    } catch {
      // non-fatal — dropdowns will be empty
    } finally {
      set({ loading: false })
    }
  },
}))
