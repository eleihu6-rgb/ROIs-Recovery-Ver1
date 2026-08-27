// gantt/src/utils/scenario-module.ts
// Shared helpers for scenario gantt module keys (e.g. `scenario-gantt:123@v1`) and their
// tab labels. Single source of truth for the label format so the view that sets the label
// and the nav dropdown that falls back to a default stay in sync.

const SCENARIO_MODULE_PREFIX = 'scenario-gantt:'

/** Parse a scenario-gantt module key into its scenario id and (optional) archived version. */
export const parseScenarioModuleKey = (module: string): { id: number; version?: string } => {
  const [idText, version] = module.slice(SCENARIO_MODULE_PREFIX.length).split('@', 2)
  return { id: Number(idText), version: version || undefined }
}

/**
 * Tab label shown in the Scenario nav dropdown.
 *  - version tab:  `v1 #123 Alpha`
 *  - current tab:  `#123 Alpha`
 *  - no name yet (fallback): `v1 #123` / `#123`
 */
export const scenarioTabLabel = (scenarioId: number, name: string, version?: string): string => {
  const base = `${version ? `${version} ` : ''}#${scenarioId}`
  return name ? `${base} ${name}` : base
}
