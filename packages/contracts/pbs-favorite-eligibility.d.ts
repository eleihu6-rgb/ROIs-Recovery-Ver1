import type { PbsDaysOffBidValue } from "./pbs-days-off-bids.js";
import type { PbsLineBidValue } from "./pbs-line-bids.js";
import type { PbsPairingBidValue } from "./pbs-pairing-bids.js";
import type { PbsPreferOffConfig } from "./pbs-prefer-off.js";

export type PbsConfiguredFavoriteBidValue =
  | PbsDaysOffBidValue
  | PbsLineBidValue
  | PbsPairingBidValue;

export type PbsFavoriteDateSemanticContext =
  | { kind: "generic" }
  | { kind: "prefer-off"; preferOffConfig?: PbsPreferOffConfig };

export declare const pbsFavoriteDateSemanticContexts: {
  readonly generic: { readonly kind: "generic" };
};

export declare const containsExplicitCalendarDate: (
  bid: PbsConfiguredFavoriteBidValue,
  semanticContext: PbsFavoriteDateSemanticContext,
) => boolean;
