export type { PaneType, PaneConfig, FloatGeometry } from './pane'
export type { ColumnConfig } from './column'
export type { Crew, CrewDetail, CrewInfo, CrewListResponse, CrewListFilters, CrewRankRecord, CrewBaseRecord, CrewCertificateRecord, CrewFleetRecord, CrewQualificationRecord, CrewTeamRecord, CrewStatusRecord, CrewQualSummary, CrewFilters, CrewQuerySession, CrewItem, CrewStats } from './crew'
export type { RosterItem, CreateRosterInput, CreateGroundTaskInput, UpdateRosterInput, SwapTasksInput, MoveTaskInput } from './roster'
export type { Flight, FlightItem, FlightCompositionStatus, FlightListQuery, FlightListResponse, FlightFilters, FlightQuerySession, FlightCrewItem, FlightCompositionCounts, FlightComposition, FlightCompositionsResponse, FlightCrewResponse, FlightPairingsResponse, FlightNaviCount, FlightNaviCountsResponse } from './flight'
export type { Pairing, PairingItem, PairingFlight, PairingSegment, CompositionSlot, PairingListQuery, PairingListResponse, PairingFilters, QuerySession } from './pairing'
export type { ScenarioStatus, ScenarioType, FlightStatusFilter, CrewDivisionFilter, CrewStatusFilter, PairingSourceFilter, TrainingExpiryFilter, NumberRangeFilter, DateRangeFilter, PoFilterParams, RoFilterParams, ToFilterParams, FilterParams, ScenarioItem, ScenarioDetail, ScenarioVersion, ScenarioVersionDiffItem, ScenarioVersionDiff, ScenarioVersionListResponse, ScenarioKpi, ScenarioResultRow, ScenarioResults, ScenarioRunPhase, ScenarioRunProgress, ScenarioListQuery, ScenarioListResponse, ScenarioRunHealth, ScenarioRunHealthOverall, ScenarioRunServiceHealth, ScenarioRunServiceKey, ScenarioRunServiceStatus, ScenarioParameterType, ScenarioParameterItem, ScenarioParameterResponse, ScenarioParameterSaveRequest, CreateScenarioInput, UpdateScenarioInput, RosterAssignment, ScenarioNoteMessage, ScenarioNoteListResponse } from './scenario'
export type { Composition, CompositionRank, CompositionLoad, CreateCompositionData, CreateLoadData, CreateRankData } from './composition'

/** Standard API response envelope */
export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

/** Dictionary entry */
export interface DictionaryItem {
  id: number
  parentCode: string | null
  code: string | null
  name: string | null
  idx: number | null
  codeValue: string | null
}

/** Date range used by filters and data fetching */
export interface DateRange {
  start: Date
  end: Date
}

export type {
  PaneType as LayoutPaneType,
  PaneViewport,
  PaneSelection,
  PaneInstance,
  GridPosition,
  LayoutGrid,
  LayoutState,
  DragState,
  SharedTimelineState,
} from './layout'

export { PANE_COLORS, PANE_NAMES } from './layout'
