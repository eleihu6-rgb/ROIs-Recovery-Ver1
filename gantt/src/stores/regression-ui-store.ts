import { create } from 'zustand'

/** Per-category roll-up used by the Regression sidebar tree. */
export interface RegressionCategorySummary {
  name: string
  total: number
  pass: number
  fail: number
}

interface RegressionUiStore {
  /** Category roll-ups, published by RegressionView from the loaded tests. */
  categories: RegressionCategorySummary[]
  /** Active category filter shared between the sidebar tree and the main list. '' = all. */
  categoryFilter: string
  setCategories: (categories: RegressionCategorySummary[]) => void
  setCategoryFilter: (category: string) => void
}

export const useRegressionUiStore = create<RegressionUiStore>((set) => ({
  categories: [],
  categoryFilter: '',
  setCategories: (categories) => set({ categories }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}))
