import { LineholderBidServiceError } from "../lineholder/shared.js";

class PairingBidServiceError extends LineholderBidServiceError {
  constructor(statusCode: number, message: string) {
    super(statusCode, message);
    this.name = "PairingBidServiceError";
  }
}

export { PairingBidServiceError };
