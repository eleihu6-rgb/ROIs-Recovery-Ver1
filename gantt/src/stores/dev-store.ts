import { create } from 'zustand'

import { DEV_ACCESS_CODE, DEV_UNLOCK_KEY, type FocusKey } from '@/components/dev/dev-playbook-data'

/** Per-session unlock flag, persisted in sessionStorage (survives reload, not tab close). */
const readUnlocked = (): boolean =>
  typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_UNLOCK_KEY) === '1'

export type DevSubView = 'timeline' | 'playbook' | 'skills'

interface DevStore {
  /** Dev-tab access gate (soft, separate from login). */
  unlocked: boolean
  /** Right-side sub-view. */
  subView: DevSubView
  /** Enhancement-timeline filters/search. null/'' = no filter. */
  moduleFilter: string | null
  focusFilter: FocusKey | null
  search: string
  /** Selected project skill folder name. */
  selectedSkill: string | null
  /** Returns true if code matched and tab unlocked. */
  tryUnlock: (code: string) => boolean
  setSubView: (v: DevSubView) => void
  setModuleFilter: (module: string | null) => void
  setFocusFilter: (focus: FocusKey | null) => void
  setSearch: (q: string) => void
  setSelectedSkill: (skill: string | null) => void
  clearFilters: () => void
}

export const useDevStore = create<DevStore>((set) => ({
  unlocked: readUnlocked(),
  subView: 'timeline',
  moduleFilter: null,
  focusFilter: null,
  search: '',
  selectedSkill: null,
  tryUnlock: (code) => {
    if (code !== DEV_ACCESS_CODE) return false
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(DEV_UNLOCK_KEY, '1')
    set({ unlocked: true })
    return true
  },
  setSubView: (subView) => set({ subView }),
  // Selecting a module implies timeline view so the filtered result is visible.
  setModuleFilter: (moduleFilter) => set({ moduleFilter, subView: 'timeline' }),
  setFocusFilter: (focusFilter) => set({ focusFilter, subView: 'timeline' }),
  setSearch: (search) => set({ search, subView: 'timeline' }),
  setSelectedSkill: (selectedSkill) => set({ selectedSkill, subView: 'skills' }),
  clearFilters: () => set({ moduleFilter: null, focusFilter: null, search: '', subView: 'timeline' }),
}))
