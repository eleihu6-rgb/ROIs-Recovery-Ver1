import type { AlgorithmExportCrewFilters } from "./export-scope.js";

export type PbsAlgorithmExportPackage = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

export type AlgorithmExportPeriodContext = {
  rosterPeriodId: number;
  rosterPeriodKey: string;
  periodCode: string;
  rpStartLocal: string;
  rpEndLocal: string;
};

export interface PbsAlgorithmExportService {
  exportCurrentPackage: (rosterPeriodId: number, periodCode: string, filters?: AlgorithmExportCrewFilters) => Promise<PbsAlgorithmExportPackage>;
  exportYeg14TestPackage: (rosterPeriodId: number, periodCode: string) => Promise<PbsAlgorithmExportPackage>;
  exportScenarioPackage: (
    rosterPeriodId: number,
    periodCode: string,
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
    filters?: AlgorithmExportCrewFilters,
  ) => Promise<PbsAlgorithmExportPackage>;
}
