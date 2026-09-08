/** Initial Cross Base recovery parameters. Values are editable in the Recovery dialog. */
export interface CrossBaseRecoveryConfig {
  /** Minimum hours between now and the outbound DHD departure. */
  minFlightLeadHours: number
  /**
   * Maximum hours between the outbound DHD departure and the affected
   * Roster start (or symmetrically between the Roster end and the inbound
   * DHD departure). Caps the positioning window so the support Crew is
   * never sent to stand by for too long before/after the recovered Roster.
   */
  maxFlightLeadHours: number
  /** Required buffer between outbound DHD arrival and the affected Roster start. */
  reserveBeforeHours: number
  /** Required buffer between the affected Roster end and the return DHD departure. */
  returnAfterHours: number
}

export const DEFAULT_CROSS_BASE_RECOVERY_CONFIG: CrossBaseRecoveryConfig = {
  minFlightLeadHours: 2,
  maxFlightLeadHours: 6,
  reserveBeforeHours: 2,
  returnAfterHours: 1,
}

export const CROSS_BASE_DHD_COST_PER_MINUTE = 8
