export class SimulatedCrewPortalError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "SimulatedCrewPortalError";
    this.statusCode = statusCode;
  }
}
