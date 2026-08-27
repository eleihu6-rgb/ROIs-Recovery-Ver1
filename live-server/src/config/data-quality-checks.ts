export interface DataQualityCheck {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning'
  /** SQL that SELECTs rows representing issues. Must include a `sample_info` text column. */
  sql: string
}

export const DATA_QUALITY_CHECKS: DataQualityCheck[] = [
  {
    id: 'crew_rank_division_mismatch',
    name: 'Crew Rank Division Mismatch',
    description: 'crew_rank rows where stored division does not match rank table division',
    severity: 'error',
    sql: `
      SELECT cr.crew_id || ' rank=' || cr.rank || ' stored=' || cr.division || ' expected=' || r.division AS sample_info
      FROM crew_rank cr
      JOIN rank r ON r.rank = cr.rank
      WHERE NOT (cr.division = ANY(string_to_array(r.division, ',')))
      LIMIT 20
    `,
  },
  {
    id: 'pairing_segment_flt_num_with_prefix',
    name: 'Pairing Segment flt_num Contains Airline Prefix',
    description: 'pairing_segment.flt_num should contain only the flight number digits, not the airline prefix (e.g. "7211" not "F87211")',
    severity: 'error',
    sql: `
      SELECT ps.id::text || ' flt_num=' || ps.flt_num || ' airline=' || ps.airline AS sample_info
      FROM pairing_segment ps
      WHERE ps.flt_num ~ '^[A-Z][A-Z0-9][0-9]'
      LIMIT 20
    `,
  },
  {
    id: 'pairing_segment_empty_airline',
    name: 'Pairing Segment Missing Airline',
    description: 'pairing_segment.airline should never be empty',
    severity: 'error',
    sql: `
      SELECT ps.id::text || ' flt_num=' || ps.flt_num AS sample_info
      FROM pairing_segment ps
      WHERE ps.airline IS NULL OR ps.airline = ''
      LIMIT 20
    `,
  },
  {
    id: 'crew_rank_unknown_position',
    name: 'Crew Rank Unknown Position',
    description: 'crew_rank rows with position="UNK" — rank could not be mapped to a position via rank_position table',
    severity: 'warning',
    sql: `
      SELECT cr.crew_id || ' rank=' || cr.rank AS sample_info
      FROM crew_rank cr
      WHERE cr.position = 'UNK'
      LIMIT 20
    `,
  },
  {
    id: 'pairing_segment_no_matching_flight',
    name: 'Flight-Bearing Segment Without flt_id Link',
    description: 'pairing_segment FLY/DH/SBY rows where flt_id is NULL — means the pairing worker could not link or synthesize a flight',
    severity: 'warning',
    sql: `
      SELECT ps.id::text || ' flt_num=' || ps.flt_num || ' dep=' || ps.dep_arp || ' dt=' || COALESCE(ps.flt_dt::text,'null') || ' seg=' || ps.seg_assignment AS sample_info
      FROM pairing_segment ps
      WHERE ps.seg_assignment IN ('FLY','DH','DHD','SBY')
        AND ps.flt_id IS NULL
      LIMIT 20
    `,
  },
  {
    id: 'pairing_segment_fly_null_credited',
    name: 'FLY Segment Null Credited Minutes',
    description: 'pairing_segment FLY assignments with NULL duty_act_credited_minutes (should equal duty_act_flt_min)',
    severity: 'error',
    sql: `
      SELECT ps.id::text || ' flt_num=' || ps.flt_num || ' flt_min=' || COALESCE(ps.duty_act_flt_min::text,'null') AS sample_info
      FROM pairing_segment ps
      WHERE ps.seg_assignment = 'FLY'
        AND ps.duty_act_credited_minutes IS NULL
        AND (ps.duty_act_flt_min IS NOT NULL AND ps.duty_act_flt_min > 0)
      LIMIT 20
    `,
  },
  {
    id: 'crew_without_base',
    name: 'Active Crew Without Base',
    description: 'Crew records with no crew_base entries (cannot determine home base)',
    severity: 'warning',
    sql: `
      SELECT c.crew_id AS sample_info
      FROM crew c
      WHERE NOT EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = c.crew_id)
      LIMIT 20
    `,
  },
  {
    id: 'flight_backfill_connector_duplicate',
    name: 'Backfilled Flight Duplicating Connector-Imported Flight',
    description: 'Synthesized/backfilled flights (interface_flt_id IS NULL, prefixed flt_num) that match a connector-imported flight on (airline, flt_dt, flt_num, dep_arp, arv_arp) — should be 0 after dedup fix',
    severity: 'error',
    sql: `
      SELECT f1.id::text || ' flt_num=' || f1.flt_num || ' dt=' || f1.flt_dt || ' dep=' || f1.dep_arp || ' arv=' || f1.arv_arp AS sample_info
      FROM flight f1
      WHERE f1.interface_flt_id IS NULL
        AND f1.flt_num ~ '^[A-Z][A-Z0-9][0-9]'
        AND EXISTS (
          SELECT 1 FROM flight f2
          WHERE f2.interface_flt_id IS NOT NULL
            AND f2.airline  = substring(f1.flt_num from 1 for 2)
            AND f2.flt_num  = substring(f1.flt_num from 3)
            AND f2.flt_dt   = f1.flt_dt
            AND f2.dep_arp  = f1.dep_arp
            AND f2.arv_arp  = f1.arv_arp
        )
      LIMIT 20
    `,
  },
]
