import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { pairingService } from "@/shared/services/pairing-service";

export const pairingPageDataQueryKey = ["pairing", "page-data"] as const;

export const usePairingPageData = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: pairingPageDataQueryKey,
    queryFn: () => pairingService.getPageData(),
    enabled: options.enabled,
    ...workbenchQueryDefaults,
  });
