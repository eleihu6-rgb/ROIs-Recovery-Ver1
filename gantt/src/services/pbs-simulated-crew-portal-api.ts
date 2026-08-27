import { api } from './api'

export interface SimulatedCrewPortalSession {
  url: string
  expiresAt?: string
}

export interface SimulatedCrewPortalConfig {
  portalPublicUrl: string
  loginTtlSeconds: number
}

export interface SimulatedCrewPortalLogItem {
  id: string
  adminUser: string
  adminUserCode: string
  crewCode: string
  crewName: string
  result: string
  loginTime: string
}

export interface SimulatedCrewPortalLogsResponse {
  logs: SimulatedCrewPortalLogItem[]
}

export const createSimulatedCrewPortalSession = async (
  crewCode: string,
): Promise<SimulatedCrewPortalSession> =>
  api.post('/api/admin/simulated-crew-portal/sessions', { crewCode }) as Promise<SimulatedCrewPortalSession>

export const fetchSimulatedCrewPortalConfig = async (): Promise<SimulatedCrewPortalConfig> =>
  api.get('/api/admin/simulated-crew-portal/config') as Promise<SimulatedCrewPortalConfig>

export const saveSimulatedCrewPortalConfig = async (
  config: SimulatedCrewPortalConfig,
): Promise<SimulatedCrewPortalConfig> =>
  api.put('/api/admin/simulated-crew-portal/config', config) as Promise<SimulatedCrewPortalConfig>

export const fetchSimulatedCrewPortalLogs = async (
  limit = 50,
): Promise<SimulatedCrewPortalLogsResponse> =>
  api.get(`/api/admin/simulated-crew-portal/logs?limit=${limit}`) as Promise<SimulatedCrewPortalLogsResponse>
