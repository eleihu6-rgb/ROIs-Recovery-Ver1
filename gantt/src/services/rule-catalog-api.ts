import { api } from './api'
import type { RuleTemplate, FullInstanceConfig, NewInstanceData, InstancePatch } from '@/types/rule-config'

export const ruleCatalogApi = {
  listTemplates: (): Promise<RuleTemplate[]> =>
    api.get('/api/rule/templates') as Promise<RuleTemplate[]>,

  listInstances: (): Promise<FullInstanceConfig[]> =>
    api.get('/api/rule/instances/all') as Promise<FullInstanceConfig[]>,

  createInstance: (data: NewInstanceData): Promise<FullInstanceConfig> =>
    api.post('/api/rule/instances', data) as Promise<FullInstanceConfig>,

  updateInstance: (instanceCode: string, patch: InstancePatch): Promise<void> =>
    api.patch(`/api/rule/instances/${encodeURIComponent(instanceCode)}`, patch) as Promise<void>,

  deleteInstance: (instanceCode: string): Promise<void> =>
    api.delete(`/api/rule/instances/${encodeURIComponent(instanceCode)}`) as Promise<void>,
}
