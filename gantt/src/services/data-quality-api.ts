import { api } from './api'

export interface DataQualityCheckResult {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning'
  count: number
  samples: string[]
  pass: boolean
}

export interface DataQualityReport {
  summary: { total: number; errors: number; warnings: number; passed: number }
  checks: DataQualityCheckResult[]
  checkedAt: string
}

export async function fetchDataQualityReport(): Promise<DataQualityReport> {
  const res = await api.get<{ code: number; data: DataQualityReport; message: string }>(
    '/admin/data-quality',
  )
  return res.data.data
}
