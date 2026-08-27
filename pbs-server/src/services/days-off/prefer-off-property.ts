import type {
  PbsDaysOffDraftProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const PREFER_OFF_PROPERTY_CODE = 201;

type PreferOffPropertyOptions = {
  periodCode: string;
  preferOffConfig?: PbsPreferOffConfig;
};

export const normalizePreferOffProperty = <TProperty extends PbsDaysOffDraftProperty>(
  property: TProperty,
  _options: PreferOffPropertyOptions,
): TProperty => {
  if (property.propertyCode !== PREFER_OFF_PROPERTY_CODE || property.bid.type !== "tag-list") {
    return property;
  }

  void _options;

  return {
    ...property,
    allOrNothing: true,
    minimumN: null,
    maximumN: null,
  };
};
