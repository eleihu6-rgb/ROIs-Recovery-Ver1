// Partition resolver for DB-backed scenario Gantt reads.
//
// A scenario resolves three datasets by partition pointers on its `scenario` row:
//   - pairing family via `pairing_scenario_id`
//   - flight family via `flight_scenario_id`
//   - roster via the scenario's own `id`
//
// Partition `0` = live (read from `f8.*`); any non-zero value = a frozen copy in
// the `scenario` schema. Because live `f8.*` rows are uniformly `scenario_id/sch_id = 0`,
// the same `WHERE <partCol> = <pointer>` works against either schema.
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'

export interface ScenarioPointers {
  id: number
  pairingScenarioId: number
  flightScenarioId: number
}

export interface ResolvedPartitions {
  rosterPart: number
  pairingTable: string
  segmentTable: string
  compositionTable: string
  pairingPart: number
  flightTable: string
  flightCompTable: string
  flightPart: number
}

export const resolvePartitions = (sc: ScenarioPointers): ResolvedPartitions => {
  const p = sc.pairingScenarioId ?? 0
  const f = sc.flightScenarioId ?? 0
  const pSchema = p === 0 ? liveSchema() : scenarioSchema()
  const fSchema = f === 0 ? liveSchema() : scenarioSchema()
  return {
    rosterPart: sc.id,
    pairingTable: `${pSchema}.pairing`,
    segmentTable: `${pSchema}.pairing_segment`,
    compositionTable: `${pSchema}.pairing_composition`,
    pairingPart: p,
    flightTable: `${fSchema}.flight`,
    flightCompTable: `${fSchema}.flight_composition`,
    flightPart: f,
  }
}
