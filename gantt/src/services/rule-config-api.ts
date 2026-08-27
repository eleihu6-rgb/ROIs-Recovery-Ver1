import { api } from './api'
import type {
  RuleGroupConfig,
  RuleGroupItemConfig,
  RuleInstanceOption,
  NewGroupData,
  ItemPatch,
  InstancePatch,
} from '@/types/rule-config'

export const ruleConfigApi = {
  listGroups: (): Promise<RuleGroupConfig[]> =>
    api.get('/api/rule/groups') as Promise<RuleGroupConfig[]>,

  createGroup: (data: NewGroupData): Promise<RuleGroupConfig> =>
    api.post('/api/rule/groups', data) as Promise<RuleGroupConfig>,

  updateGroup: (groupCode: string, patch: { name?: string; description?: string | null; isDefault?: boolean }): Promise<void> =>
    api.patch(`/api/rule/groups/${groupCode}`, patch) as Promise<void>,

  deleteGroup: (groupCode: string): Promise<void> =>
    api.delete(`/api/rule/groups/${groupCode}`) as Promise<void>,

  listGroupItems: (groupCode: string): Promise<RuleGroupItemConfig[]> =>
    api.get(`/api/rule/groups/${groupCode}/items`) as Promise<RuleGroupItemConfig[]>,

  addItems: (groupCode: string, instanceCodes: string[]): Promise<void> =>
    api.post(`/api/rule/groups/${groupCode}/items`, { instanceCodes }) as Promise<void>,

  updateItem: (groupCode: string, instanceCode: string, patch: ItemPatch): Promise<void> =>
    api.patch(`/api/rule/groups/${groupCode}/items/${instanceCode}`, patch) as Promise<void>,

  removeItem: (groupCode: string, instanceCode: string): Promise<void> =>
    api.delete(`/api/rule/groups/${groupCode}/items/${instanceCode}`) as Promise<void>,

  reorderItems: (groupCode: string, orderedInstanceCodes: string[]): Promise<void> =>
    api.patch(`/api/rule/groups/${groupCode}/items/reorder`, { orderedInstanceCodes }) as Promise<void>,

  listInstances: (groupCode: string): Promise<RuleInstanceOption[]> =>
    api.get(`/api/rule/instances?groupCode=${encodeURIComponent(groupCode)}`) as Promise<RuleInstanceOption[]>,

  updateInstance: (instanceCode: string, patch: InstancePatch): Promise<void> =>
    api.patch(`/api/rule/instances/${encodeURIComponent(instanceCode)}`, patch) as Promise<void>,

  duplicateGroup: (groupCode: string, newGroupCode: string, newName: string): Promise<RuleGroupConfig> =>
    api.post(`/api/rule/groups/${groupCode}/duplicate`, { newGroupCode, newName }) as Promise<RuleGroupConfig>,
}
