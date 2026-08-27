import type { PbsPairingAirportOptionsResponse } from "../../../../../packages/contracts/pbs-search-pairings.js";
import { AirportPreferenceEditor } from "@/features/pairing/components/airport-preference-editor";
import type { PairingAirportPreferenceBid, PairingBidValue } from "@/features/pairing/types";

type AirportPreferenceControlProps = {
  ariaLabel: string;
  bid: PairingAirportPreferenceBid;
  airportOptions?: PbsPairingAirportOptionsResponse;
  periodCode?: string;
  onChange: (value: PairingBidValue) => void;
};

export const AirportPreferenceControl = ({
  ariaLabel,
  bid,
  airportOptions,
  periodCode = "",
  onChange,
}: AirportPreferenceControlProps) => (
  <AirportPreferenceEditor
    ariaLabel={ariaLabel}
    options={airportOptions}
    periodCode={periodCode}
    value={bid}
    onChange={onChange}
  />
);
