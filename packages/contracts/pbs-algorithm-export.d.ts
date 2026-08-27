export declare const pbsAlgorithmExportRoutes: {
  readonly currentPackage: "/admin/algorithm-export";
  readonly yeg14TestPackage: "/admin/algorithm-export/yeg-test-package";
  readonly scenarioPackage: "/admin/algorithm-export/scenario-package";
};

export type PbsAlgorithmExportFilters = {
  division?: "P" | "C" | "A" | "ALL";
  status?: "ACTIVE" | "ALL";
  bases?: string[];
  fleetQuals?: string[];
};

export type PbsAlgorithmExportQuery = PbsAlgorithmExportFilters & {
  rosterPeriodId: number;
  periodCode: string;
};

export type PbsAlgorithmExportScenarioBody = {
  rosterPeriodId: number;
  periodCode: string;
  crewIds: string[];
  // Scenario window (local calendar dates, YYYY-MM-DD) used to bound the PAIRING_SCORE
  // pairing set to the scenario's date range (±lead-in/out). Optional: when absent the
  // package uses the authoritative roster-period range.
  scenarioStart?: string;
  scenarioEnd?: string;
  filters?: PbsAlgorithmExportFilters;
};
