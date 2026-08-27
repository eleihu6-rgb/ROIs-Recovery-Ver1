import { create } from 'zustand'
import { ruleConfigApi } from '@/services/rule-config-api'
import { notify } from '@/utils/notify'
import type { RuleGroupConfig, RuleGroupItemConfig, NewGroupData, ItemPatch, InstancePatch } from '@/types/rule-config'

interface RuleConfigStore {
  groups: RuleGroupConfig[]
  selectedGroupCode: string | null
  groupItems: RuleGroupItemConfig[]
  loading: boolean
  itemsLoading: boolean

  fetchGroups: () => Promise<void>
  selectGroup: (groupCode: string) => Promise<void>
  createGroup: (data: NewGroupData) => Promise<void>
  updateGroup: (groupCode: string, patch: { name?: string; description?: string | null; isDefault?: boolean }) => Promise<void>
  deleteGroup: (groupCode: string) => Promise<void>
  duplicateGroup: (groupCode: string, newGroupCode: string, newName: string) => Promise<void>
  addItems: (instanceCodes: string[]) => Promise<void>
  updateItem: (instanceCode: string, patch: ItemPatch) => Promise<void>
  updateInstance: (instanceCode: string, patch: InstancePatch) => Promise<void>
  removeItem: (instanceCode: string) => Promise<void>
  reorderItems: (orderedInstanceCodes: string[]) => Promise<void>
}

export const useRuleConfigStore = create<RuleConfigStore>((set, get) => ({
  groups: [],
  selectedGroupCode: null,
  groupItems: [],
  loading: false,
  itemsLoading: false,

  fetchGroups: async () => {
    set({ loading: true })
    try {
      const groups = await ruleConfigApi.listGroups()
      set({ groups })
    } finally {
      set({ loading: false })
    }
  },

  selectGroup: async (groupCode: string) => {
    set({ selectedGroupCode: groupCode, itemsLoading: true, groupItems: [] })
    try {
      const items = await ruleConfigApi.listGroupItems(groupCode)
      set({ groupItems: items })
    } finally {
      set({ itemsLoading: false })
    }
  },

  createGroup: async (data: NewGroupData) => {
    const group = await ruleConfigApi.createGroup(data)
    // If created as default, need to refresh list to get updated isDefault status for other groups
    if (data.isDefault) {
      await get().fetchGroups()
    } else {
      set((s) => ({ groups: [...s.groups, group] }))
    }
    await get().selectGroup(group.groupCode)
  },

  updateGroup: async (groupCode: string, patch: { name?: string; description?: string | null; isDefault?: boolean }) => {
    await ruleConfigApi.updateGroup(groupCode, patch)
    // If updating isDefault, refresh list to get correct state
    if (patch.isDefault !== undefined) {
      await get().fetchGroups()
    } else {
      set((s) => ({
        groups: s.groups.map((g) =>
          g.groupCode === groupCode ? { ...g, ...patch } : g,
        ),
      }))
    }
  },

  deleteGroup: async (groupCode: string) => {
    await ruleConfigApi.deleteGroup(groupCode)
    const { groups, selectedGroupCode } = get()
    const remaining = groups.filter((g) => g.groupCode !== groupCode)
    const next = selectedGroupCode === groupCode ? (remaining[0]?.groupCode ?? null) : selectedGroupCode
    set({ groups: remaining, selectedGroupCode: next, groupItems: next ? get().groupItems : [] })
    if (next) await get().selectGroup(next)
  },

  duplicateGroup: async (groupCode: string, newGroupCode: string, newName: string) => {
    const group = await ruleConfigApi.duplicateGroup(groupCode, newGroupCode, newName)
    set((s) => ({ groups: [...s.groups, group] }))
    await get().selectGroup(newGroupCode)
  },

  addItems: async (instanceCodes: string[]) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    await ruleConfigApi.addItems(selectedGroupCode, instanceCodes)
    await get().selectGroup(selectedGroupCode)
    // Sync itemCount on the sidebar card without a full fetchGroups
    const newCount = get().groupItems.length
    set((s) => ({
      groups: s.groups.map((g) =>
        g.groupCode === selectedGroupCode ? { ...g, itemCount: newCount } : g,
      ),
    }))
  },

  updateItem: async (instanceCode: string, patch: ItemPatch) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    // Optimistic update
    set((s) => ({
      groupItems: s.groupItems.map((item) =>
        item.instanceCode === instanceCode ? { ...item, ...patch } : item,
      ),
    }))
    try {
      await ruleConfigApi.updateItem(selectedGroupCode, instanceCode, patch)
    } catch {
      notify.error('Failed to save changes')
      await get().selectGroup(selectedGroupCode)
    }
  },

  updateInstance: async (instanceCode: string, patch: InstancePatch) => {
    const { selectedGroupCode } = get()
    // Optimistic update of changed fields in groupItems
    set((s) => ({
      groupItems: s.groupItems.map((item) => {
        if (item.instanceCode !== instanceCode) return item
        return {
          ...item,
          ...('conditions' in patch ? { conditions: patch.conditions ?? null } : {}),
          ...('severity' in patch && patch.severity ? { severity: patch.severity } : {}),
          ...('messageTemplate' in patch ? { messageTemplate: patch.messageTemplate ?? null } : {}),
          ...('params' in patch && patch.params ? { params: patch.params } : {}),
        }
      }),
    }))
    try {
      await ruleConfigApi.updateInstance(instanceCode, patch)
    } catch {
      notify.error('Failed to save instance changes')
      if (selectedGroupCode) await get().selectGroup(selectedGroupCode)
    }
  },

  removeItem: async (instanceCode: string) => {
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    await ruleConfigApi.removeItem(selectedGroupCode, instanceCode)
    set((s) => ({ groupItems: s.groupItems.filter((i) => i.instanceCode !== instanceCode) }))
  },

  reorderItems: async (orderedInstanceCodes: string[]) => {
    // Optimistic reorder
    set((s) => {
      const map = new Map(s.groupItems.map((i) => [i.instanceCode, i]))
      const reordered = orderedInstanceCodes.map((code, index) => {
        const item = map.get(code)!
        return { ...item, sortOrder: index }
      })
      return { groupItems: reordered }
    })
    const { selectedGroupCode } = get()
    if (!selectedGroupCode) return
    try {
      await ruleConfigApi.reorderItems(selectedGroupCode, orderedInstanceCodes)
    } catch {
      notify.error('Failed to reorder rules')
      await get().selectGroup(selectedGroupCode)
    }
  },
}))
