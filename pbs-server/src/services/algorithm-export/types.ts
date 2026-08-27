export type PbsAlgorithmExportPackage = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

export interface PbsAlgorithmExportService {
  exportCurrentPackage: (periodCode: string) => Promise<PbsAlgorithmExportPackage>;
  exportYeg14TestPackage: (periodCode: string) => Promise<PbsAlgorithmExportPackage>;
  exportScenarioPackage: (
    periodCode: string,
    crewIds: readonly string[],
    scenarioStart?: string,
    scenarioEnd?: string,
  ) => Promise<PbsAlgorithmExportPackage>;
}
