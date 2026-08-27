import type { TierBidType } from "@/features/tier/types";

const typeStyles: Record<TierBidType, string> = {
  Pairing: "border-[#c9c7f5] bg-[#f0f0ff] text-[#5d59bd]",
  DaysOff: "border-[#bddfcb] bg-[#effaf3] text-[#32734d]",
  Line: "border-[#ffd8ac] bg-[#fff6ea] text-[#915f19]",
  Reserve: "border-[#d5dbe8] bg-[#f4f6f9] text-[#586174]",
  Unsupported: "border-[#f5c9c9] bg-[#fff1f1] text-[#a33d3d]",
};

const getTypeLabel = (bidType: TierBidType) => {
  if (bidType === "DaysOff") {
    return "Days Off";
  }

  if (bidType === "Line") {
    return "Roster";
  }

  return bidType;
};

export const TierBidTypeBadge = ({ bidType }: { bidType: TierBidType }) => (
  <span className={`inline-flex rounded-lg border px-2 py-[3px] text-xs font-semibold leading-4 ${typeStyles[bidType]}`}>
    {getTypeLabel(bidType)}
  </span>
);
