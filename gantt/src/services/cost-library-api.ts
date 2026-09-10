import { api } from './api'
import type { CostCatalog, CostInstance, CostRevision, CostSet, CostResult, RevisionDraft, SetDraft } from '@/types/cost-library'
const base = '/api/cost-library'
export const costLibraryApi = {
  catalog: (): Promise<CostCatalog> => api.get(`${base}/catalog`) as Promise<CostCatalog>,
  revisions: (id: number): Promise<CostRevision[]> => api.get(`${base}/instances/${id}/revisions`) as Promise<CostRevision[]>,
  copyInstance: (id: number): Promise<CostInstance> => api.post(`${base}/instances/${id}/copy`) as Promise<CostInstance>,
  updateInstance: (id: number, data: Pick<CostInstance, 'name' | 'enabled'>): Promise<CostInstance> => api.patch(`${base}/instances/${id}`, data) as Promise<CostInstance>,
  deleteInstance: (id: number): Promise<void> => api.delete(`${base}/instances/${id}`) as Promise<void>,
  saveRevision: (id: number, data: RevisionDraft): Promise<CostRevision> => api.post(`${base}/instances/${id}/revisions`, data) as Promise<CostRevision>,
  createSet: (data: SetDraft): Promise<CostSet> => api.post(`${base}/sets`, data) as Promise<CostSet>,
  updateSet: (id: number, data: SetDraft & { expectedVersion: number }): Promise<CostSet> => api.patch(`${base}/sets/${id}`, data) as Promise<CostSet>,
  copySet: (id: number, name: string, mode: 'shared' | 'independent'): Promise<CostSet> => api.post(`${base}/sets/${id}/copy`, { name, mode }) as Promise<CostSet>,
  deleteSet: (id: number): Promise<void> => api.delete(`${base}/sets/${id}`) as Promise<void>,
  members: (id: number, revisionIds: number[], expectedVersion: number): Promise<CostSet> => api.put(`${base}/sets/${id}/members`, { revisionIds, expectedVersion }) as Promise<CostSet>,
  calculate: (revisionId: number, inputs: Record<string, number | string>): Promise<CostResult> => api.post(`${base}/calculate`, { revisionId, inputs }) as Promise<CostResult>,
}
