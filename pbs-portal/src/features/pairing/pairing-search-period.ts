import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";

export const resolvePairingSearchPeriod = (
  currentPeriod: PbsCurrentPeriod | null | undefined,
  periodCode?: string | null,
): PairingSearchPeriodReference | null => {
  const rosterPeriodId = currentPeriod?.rosterPeriodId ?? currentPeriod?.id ?? null;

  if (!Number.isInteger(rosterPeriodId) || (rosterPeriodId ?? 0) <= 0) {
    return null;
  }

  return {
    rosterPeriodId: rosterPeriodId as number,
    periodCode: periodCode?.trim() || currentPeriod?.periodCode || undefined,
  };
};
