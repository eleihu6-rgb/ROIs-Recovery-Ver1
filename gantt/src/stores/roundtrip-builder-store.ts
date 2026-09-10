import { create } from 'zustand'
import type { PairingItem } from '@/types'
import { prependBuiltPairings } from '@/utils/pairing-build-focus'

interface RoundtripBuilderState {
  isOpen: boolean
  running: boolean
  progress: string
  created: PairingItem[]
  open: () => void
  close: () => void
  setProgress: (running: boolean, progress: string) => void
  addCreated: (item: PairingItem) => void
  clearFocus: () => void
  removeCreated: (id: number) => void
}
export const useRoundtripBuilderStore = create<RoundtripBuilderState>((set) => ({
  isOpen: false,
  running: false,
  progress: '',
  created: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setProgress: (running, progress) => set({ running, progress }),
  addCreated: (item) => set((state) => ({ created: prependBuiltPairings(state.created, [item]) })),
  clearFocus: () => set({ created: [] }),
  removeCreated: (id) => set((state) => ({ created: state.created.filter((item) => item.pairing.id !== id) })),
}))
