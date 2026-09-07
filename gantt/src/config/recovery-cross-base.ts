/** Initial Cross Base recovery parameters. Values are editable in the Recovery dialog. */
export interface CrossBaseRecoveryConfig {
  /** Minimum hours between now and the outbound DHD departure. */
  minFlightLeadHours: number
  /** Required buffer between outbound DHD arrival and the affected Roster start. */
  reserveBeforeHours: number
  /** Required buffer between the affected Roster end and the return DHD departure. */
  returnAfterHours: number
}

export const DEFAULT_CROSS_BASE_RECOVERY_CONFIG: CrossBaseRecoveryConfig = {
  minFlightLeadHours: 2,
  reserveBeforeHours: 2,
  returnAfterHours: 1,
}

export const CROSS_BASE_DHD_COST_PER_MINUTE = 8
