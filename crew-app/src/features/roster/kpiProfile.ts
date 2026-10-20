// ─── Crew limit profiles (roster estimate) ──────────────────────────────────
// The crew-app's schedule KPI card must never apply one airline's regulatory
// limits to another carrier. The limits therefore live here as per-carrier
// configuration, mirroring the existing per-airline knobs in
// `features/auth/airlines.ts`.
//
// Source of the values below: the operators' published duty/flight-time
// limits for the two portals the app captures today (TG and PR). Both use the
// same ICAO-derived set as the design reference. This is a ROSTER ESTIMATE: a
// real legality answer also needs rest, FDP and the operator's allocation
// policy, which this card does not compute. A carrier without an entry here
// shows "limits not configured" instead of borrowing another operator's caps.

export interface KpiLimits {
  /** Stable id, shown in the detail sheet so the source is identifiable. */
  id: string;
  /** Human label for the detail sheet. */
  label: string;
  duty7Minutes: number;
  duty14Minutes: number;
  duty28Minutes: number;
  block28Minutes: number;
  blockYearMinutes: number;
  block12MonthMinutes: number;
  /** Minimum take-offs and landings in 90 days (one row each). */
  recencyMinimum: number;
}

const SHARED_OPERATOR_LIMITS = {
  duty7Minutes: 60 * 60,
  duty14Minutes: 110 * 60,
  duty28Minutes: 190 * 60,
  block28Minutes: 100 * 60,
  blockYearMinutes: 900 * 60,
  block12MonthMinutes: 1000 * 60,
  recencyMinimum: 3,
} as const;

export const KPI_PROFILES: Record<string, KpiLimits> = {
  TG: {
    id: 'tg-operator',
    label: 'THAI limits · roster estimate',
    ...SHARED_OPERATOR_LIMITS,
  },
  PR: {
    id: 'pr-operator',
    label: 'PAL limits · roster estimate',
    ...SHARED_OPERATOR_LIMITS,
  },
};

/** The configured limit profile for a carrier, or null when none is defined. */
export function kpiProfileFor(carrier: string | null | undefined): KpiLimits | null {
  const code = (carrier || '').trim().toUpperCase();
  return code ? KPI_PROFILES[code] ?? null : null;
}
