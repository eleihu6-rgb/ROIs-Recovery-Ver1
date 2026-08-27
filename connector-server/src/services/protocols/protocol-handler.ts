import { ConnectorConfig } from '../../models/index.js'

/**
 * Protocol handler interface
 * All protocol handlers must implement this interface
 */
export interface ProtocolHandler {
  /**
   * Execute the protocol handler
   * @param config - Connector configuration
   * @param extra - Optional extra data (rawData for push, records for outbound, etc)
   * @returns Execution result with status and record counts
   */
  execute(config: ConnectorConfig, extra?: unknown): Promise<ExecuteResult>
}

/**
 * Execution result returned by all protocol handlers
 */
export interface ExecuteResult {
  status: 'success' | 'fail' | 'partial'
  recordsIn: number
  recordsOut: number
  errorMessage?: string
  durationMs: number
  responseStatus?: number
  responseBody?: string
}
