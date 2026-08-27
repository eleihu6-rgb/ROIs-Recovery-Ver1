import { useQuery } from "@tanstack/react-query";

import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { pairingService } from "@/shared/services/pairing-service";

export const useRedeyeConfig = (enabled: boolean) =>
  useQuery({
    queryKey: ["pairing", "redeye-config"],
    queryFn: () => pairingService.getRedeyeConfig(),
    enabled,
    ...workbenchQueryDefaults,
    staleTime: 0,
    refetchOnMount: "always",
  });
