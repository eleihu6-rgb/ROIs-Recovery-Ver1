import { api } from './api'

export interface LockAcquireResponse {
  crewId: string
  pairingIds: number[]
  expiresAt: number
}

export interface LockConflict {
  lockKey: string
  heldBy: string
  acquiredAt: number
}

export interface LockInfo {
  lockType: 'crew' | 'pairing'
  lockId: string
  userId: string
  acquiredAt: number
  expiresAt: number
}

export const lockApi = {
  async acquire(crewId: string, pairingIds: number[], username: string): Promise<LockAcquireResponse> {
    return api.post('/api/locks/acquire', { crewId, pairingIds, username }) as Promise<LockAcquireResponse>
  },

  async release(crewId: string, pairingIds: number[], username: string): Promise<void> {
    await api.post('/api/locks/release', { crewId, pairingIds, username })
  },

  async heartbeat(lockKeys: string[], username: string): Promise<{ renewed: number }> {
    return api.post('/api/locks/heartbeat', { lockKeys, username }) as Promise<{ renewed: number }>
  },

  async getAll(): Promise<LockInfo[]> {
    return api.get('/api/locks') as Promise<LockInfo[]>
  },
}
