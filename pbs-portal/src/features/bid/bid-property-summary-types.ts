export const BID_SUMMARY_COLLAPSED_GROUP_LIMIT = 3;
export const BID_SUMMARY_COLLAPSED_VALUE_LIMIT = 3;

export type BidPropertySummaryGroup = {
  key: string;
  label: string;
  values: string[];
  rawValues: string[];
};

export type BidPropertyTextSummary = {
  kind: "text";
  text: string;
  title: string;
};

export type BidPropertySelectionSummary = {
  kind: "selection-list";
  headline: string;
  groups: BidPropertySummaryGroup[];
  totalItemCount: number;
  collapsedGroupLimit: number;
  collapsedValueLimit: number;
  title: string;
};

export type BidPropertySummary =
  | BidPropertyTextSummary
  | BidPropertySelectionSummary;

export const buildBidPropertyTextSummary = (text: string): BidPropertyTextSummary => ({
  kind: "text",
  text,
  title: text,
});
