import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import {
  pbsReserveAaPropertyCodes,
  pbsReserveLegacyPropertyCodes,
} from "../../../../../packages/contracts/pbs-reserve-bids.js";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import type { PairingBidValue } from "@/features/pairing/types";
import {
  isReservePreferenceValueComplete,
  ReservePreferenceEditor,
} from "@/features/reserve/components/reserve-preference-editor";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";
import { isPairingBidValue } from "@/features/rule-bids/types";
import { PbsBidDialogFooter } from "@/shared/components/preferences/pbs-bid-dialog-footer";
import { Button } from "@/shared/components/ui/button";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { PortalDatePicker } from "@/shared/components/ui/portal-date-picker";

type ReserveBidDialogProps = {
  confirmLabel?: string;
  isOpen: boolean;
  isPending: boolean;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  property: RuleBidExistingProperty;
  onCancel: () => void;
  onConfirm: (property: RuleBidExistingProperty) => void;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PROPERTY_CODES = new Set<number>([
  pbsReserveLegacyPropertyCodes.reserveDayOn,
  pbsReserveAaPropertyCodes.preferOff,
]);
const toReserveDialogBid = (bid: RuleBidExistingProperty["bid"]): PairingBidValue => {
  if (!isPairingBidValue(bid)) {
    throw new Error(`${bid.type} bids are not valid for Reserve.`);
  }

  return bid;
};

const cloneBid = (bid: PairingBidValue): PairingBidValue => structuredClone(bid);

const getTagListValues = (bid: PairingBidValue) => bid.type === "tag-list" ? bid.values : [];

const buildDateBid = (source: PairingBidValue, dates: string[]): PairingBidValue => ({
  type: "tag-list",
  values: dates,
  suggestions: source.type === "tag-list" ? source.suggestions : [],
});

const normalizeDates = (dates: string[]) =>
  [...new Set(dates.map((date) => date.trim()).filter((date) => ISO_DATE_PATTERN.test(date)))].sort();

const isSelectBidComplete = (bid: PairingBidValue) =>
  bid.type === "select" && bid.value.trim().length > 0 && bid.options.includes(bid.value);

const toShortCallTypeBid = (bid: PairingBidValue): Extract<PairingBidValue, { type: "reserve-call-type-date-scope" }> => {
  if (bid.type === "reserve-call-type-date-scope") {
    return {
      ...bid,
      options: [...bid.options],
      dateScope: bid.dateScope.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : { ...bid.dateScope },
    };
  }

  if (bid.type === "select") {
    return {
      type: "reserve-call-type-date-scope",
      callType: bid.value,
      options: [...bid.options],
      dateScope: { mode: "whole_month" },
    };
  }

  return {
    type: "reserve-call-type-date-scope",
    callType: "",
    options: [],
    dateScope: { mode: "whole_month" },
  };
};

export const ReserveBidDialog = ({
  confirmLabel = "UPDATE BID",
  isOpen,
  isPending,
  periodCode,
  periodEndDate,
  periodStartDate,
  property,
  onCancel,
  onConfirm,
}: ReserveBidDialogProps) => {
  const isDateProperty = DATE_PROPERTY_CODES.has(property.propertyCode);
  const isShortCallTypeProperty = property.propertyCode === pbsReserveLegacyPropertyCodes.shortCallType;
  const [bid, setBid] = useState<PairingBidValue>(() => {
    const propertyBid = toReserveDialogBid(property.bid);
    return isShortCallTypeProperty ? toShortCallTypeBid(propertyBid) : cloneBid(propertyBid);
  });
  const [dates, setDates] = useState<string[]>(() => normalizeDates(getTagListValues(toReserveDialogBid(property.bid))));
  const [dateDraft, setDateDraft] = useState("");

  useEffect(() => {
    const propertyBid = toReserveDialogBid(property.bid);
    setBid(property.propertyCode === pbsReserveLegacyPropertyCodes.shortCallType
      ? toShortCallTypeBid(propertyBid)
      : cloneBid(propertyBid));
    setDates(normalizeDates(getTagListValues(propertyBid)));
    setDateDraft("");
  }, [property]);

  const activeBid = useMemo(
    () => isDateProperty ? buildDateBid(toReserveDialogBid(property.bid), dates) : bid,
    [bid, dates, isDateProperty, property.bid],
  );
  const canConfirm = !isPending
    && (isDateProperty
      ? dates.length > 0
      : activeBid.type === "reserve-call-type-date-scope"
        ? isReservePreferenceValueComplete(activeBid, periodStartDate, periodEndDate)
        : isSelectBidComplete(activeBid));

  if (!isOpen) {
    return null;
  }

  const addDate = () => {
    const normalizedDate = dateDraft.trim();

    if (isPending || !ISO_DATE_PATTERN.test(normalizedDate) || dates.includes(normalizedDate)) {
      return;
    }

    setDates((current) => [...current, normalizedDate].sort());
    setDateDraft("");
  };

  const removeDate = (date: string) => {
    if (isPending) {
      return;
    }

    setDates((current) => current.filter((item) => item !== date));
  };

  const confirm = () => {
    if (!canConfirm) {
      return;
    }

    onConfirm({
      ...property,
      bid: activeBid,
    });
  };

  return (
    <PbsDialogFrame
      ariaLabel={isShortCallTypeProperty ? "Configure Reserve Preference" : `Edit reserve bid for ${property.name}`}
      bodyClassName="mt-5"
      closeDisabled={isPending}
      footerClassName="mt-6 flex justify-end gap-2"
      panelClassName="w-[min(560px,calc(100vw-32px))]"
      header={(
        <div className="flex items-center">
          <div>
            <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">
              {isShortCallTypeProperty ? "Configure Reserve Preference" : "Edit Reserve Bid"}
            </p>
            {!isShortCallTypeProperty ? (
              <p className="m-0 mt-1 text-sm font-medium leading-5 text-[#6f7485]">{property.name}</p>
            ) : null}
          </div>
          <button
            aria-label="Close reserve bid dialog"
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isPending}
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={isShortCallTypeProperty ? (
        <PbsBidDialogFooter
          canConfirm={canConfirm}
          confirmLabel={confirmLabel}
          confirmPendingLabel="UPDATING..."
          isPending={isPending}
          onCancel={onCancel}
          onConfirm={confirm}
        />
      ) : (
        <>
          <Button
            className="h-9 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-4 text-xs font-bold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
            disabled={isPending}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            CANCEL
          </Button>
          <Button
            className="h-9 cursor-pointer rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
            disabled={!canConfirm}
            type="button"
            onClick={confirm}
          >
            {isPending ? "UPDATING..." : confirmLabel}
          </Button>
        </>
      )}
      onClose={onCancel}
    >
      {activeBid.type === "reserve-call-type-date-scope" ? (
        <ReservePreferenceEditor
          ariaLabel={property.name}
          disabled={isPending}
          periodCode={periodCode}
          periodEndDate={periodEndDate}
          periodStartDate={periodStartDate}
          value={activeBid}
          onChange={setBid}
        />
      ) : (
        <>
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">BID</p>
          <div className="mt-2">
            {isDateProperty ? (
              <div>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                  <PortalDatePicker
                    ariaLabel={`Reserve date for ${property.name}`}
                    className="h-9 rounded-lg border-[#cfd6e4] text-sm text-[#6f7485] shadow-none focus-visible:ring-0"
                    disabled={isPending}
                    value={dateDraft}
                    onValueChange={setDateDraft}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      event.preventDefault();
                      addDate();
                    }}
                  />
                  <Button
                    className="h-9 whitespace-nowrap rounded-lg bg-[#6866cc] px-4 text-xs font-bold text-white"
                    disabled={isPending || !ISO_DATE_PATTERN.test(dateDraft)}
                    type="button"
                    onClick={addDate}
                  >
                    ADD DATE
                  </Button>
                </div>

                <div className="mt-3 flex min-h-[30px] flex-wrap gap-2">
                  {dates.map((date) => (
                    <button
                      key={date}
                      aria-label={`Remove reserve date ${date} from ${property.name}`}
                      className="inline-flex h-[28px] cursor-pointer items-center gap-1 rounded-full border border-[#6467d1] bg-[#eef2ff] px-3 text-xs font-semibold text-[#6467d1] transition hover:bg-[#dfe5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={isPending}
                      type="button"
                      onClick={() => removeDate(date)}
                    >
                      {date}
                      <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <PairingBidControl
                ariaLabel={`Configure bid for ${property.name}`}
                bid={bid}
                onChange={setBid}
              />
            )}
          </div>
        </>
      )}
    </PbsDialogFrame>
  );
};
