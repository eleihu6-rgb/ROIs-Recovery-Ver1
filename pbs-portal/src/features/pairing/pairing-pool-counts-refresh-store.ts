import { create } from "zustand";
import type { PairingExistingProperty } from "@/features/pairing/types";
import { cloneExistingProperties } from "@/features/pairing/pairing-property-transform";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";

export type PairingPoolCountsRefreshInput = {
  existingProperties: PairingExistingProperty[];
  period: PairingSearchPeriodReference | null;
};

export type PairingPoolCountsRefreshRequest = PairingPoolCountsRefreshInput & {
  sequence: number;
};

type PairingPoolCountsRefreshState = {
  request: PairingPoolCountsRefreshRequest | null;
  requestPairingPoolCountsRefresh: (input: PairingPoolCountsRefreshInput) => void;
  resetPairingPoolCountsRefresh: () => void;
};

export const usePairingPoolCountsRefreshStore = create<PairingPoolCountsRefreshState>((set) => ({
  request: null,
  requestPairingPoolCountsRefresh: (input) => {
    set((state) => ({
      request: {
        sequence: (state.request?.sequence ?? 0) + 1,
        existingProperties: cloneExistingProperties(input.existingProperties),
        period: input.period,
      },
    }));
  },
  resetPairingPoolCountsRefresh: () => {
    set({ request: null });
  },
}));
