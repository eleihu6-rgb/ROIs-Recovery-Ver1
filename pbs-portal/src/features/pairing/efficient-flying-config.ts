import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { pairingService } from "@/shared/services/pairing-service";

export const EFFICIENT_FLYING_PROPERTY_CODE = 428;

export const isEfficientFlyingPercentileValid = (percentile: number | undefined): percentile is number =>
  Number.isInteger(percentile) && percentile !== undefined && percentile >= 1 && percentile <= 50;

export const useEfficientFlyingConfig = (enabled: boolean) => {
  const shouldRefetchOnEnable = useRef(false);
  const query = useQuery({
    queryKey: ["pairing", "efficient-flying-config"],
    queryFn: () => pairingService.getEfficientFlyingConfig(),
    enabled,
    ...workbenchQueryDefaults,
    refetchOnMount: "always",
  });
  const { dataUpdatedAt, refetch } = query;

  useEffect(() => {
    if (!enabled) {
      shouldRefetchOnEnable.current = true;
      return;
    }

    if (shouldRefetchOnEnable.current && dataUpdatedAt > 0) {
      shouldRefetchOnEnable.current = false;
      void refetch();
    }
  }, [dataUpdatedAt, enabled, refetch]);

  return query;
};
