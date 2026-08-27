import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { linePageDataQueryKey } from "@/features/line/hooks/use-line-page-data";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import type { PairingPageData } from "@/features/pairing/types";
import { reservePageDataQueryKey } from "@/features/reserve/hooks/use-reserve-page-data";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { queryClient } from "@/shared/query/query-client";

export type CurrentBidDraftMeta = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  draftVersion: number;
  periodCode: string;
  bidContext: "Current" | "StandingLineholder" | "StandingReserve";
};

let currentBidMutationQueue: Promise<void> = Promise.resolve();
let latestSuccessfulCurrentBidMeta: CurrentBidDraftMeta | null = null;
let queuedCurrentBidMutationCount = 0;

const isSameCurrentBid = (
  candidate: CurrentBidDraftMeta,
  fallback: CurrentBidDraftMeta,
) =>
  candidate.bidContext === "Current"
  && candidate.periodCode === fallback.periodCode
  && (
    candidate.bidId === undefined
    || fallback.bidId === undefined
    || candidate.bidId === fallback.bidId
  )
  && (
    candidate.draftKey === undefined
    || fallback.draftKey === undefined
    || candidate.draftKey === fallback.draftKey
  );

const readCachedDraftMetas = (): CurrentBidDraftMeta[] => {
  const daysOff = queryClient.getQueryData<RuleBidPageData>(daysOffPageDataQueryKey);
  const pairing = queryClient.getQueryData<PairingPageData>(pairingPageDataQueryKey);
  const line = queryClient.getQueryData<RuleBidPageData>(linePageDataQueryKey);
  const reserve = queryClient.getQueryData<RuleBidPageData>(reservePageDataQueryKey);

  return [
    daysOff?.rightPanel.draftMeta,
    pairing?.rightPanel.draftMeta,
    line?.rightPanel.draftMeta,
    reserve?.rightPanel.draftMeta,
  ].filter((meta): meta is CurrentBidDraftMeta => meta?.bidContext === "Current");
};

export const resolveLatestCurrentBidDraftMeta = <Meta extends CurrentBidDraftMeta>(
  fallback: Meta,
): Meta => {
  if (fallback.bidContext !== "Current") {
    return fallback;
  }

  const latest = readCachedDraftMetas()
    .concat(latestSuccessfulCurrentBidMeta ?? [])
    .filter((meta) => isSameCurrentBid(meta, fallback))
    .sort((left, right) => right.draftVersion - left.draftVersion)[0];

  if (!latest) {
    return fallback;
  }

  return {
    ...fallback,
    ...latest,
  };
};

const readMutationResultMeta = (
  result: unknown,
  fallback: CurrentBidDraftMeta,
): CurrentBidDraftMeta | null => {
  if (!result || typeof result !== "object") {
    return null;
  }

  const response = result as Partial<CurrentBidDraftMeta> & {
    draft?: Partial<CurrentBidDraftMeta>;
    draftMeta?: Partial<CurrentBidDraftMeta>;
  };
  const candidate = typeof response.draftMeta?.draftVersion === "number"
    ? response.draftMeta
    : typeof response.draft?.draftVersion === "number"
      ? response.draft
      : response;

  if (typeof candidate.draftVersion !== "number") {
    return null;
  }

  return {
    ...fallback,
    ...candidate,
  };
};

export const runCurrentBidMutation = async <
  Meta extends CurrentBidDraftMeta,
  Result,
>(
  fallback: Meta,
  mutation: (latestMeta: Meta) => Promise<Result>,
): Promise<Result> => {
  queuedCurrentBidMutationCount += 1;
  const previousMutation = currentBidMutationQueue;
  let releaseQueue: () => void = () => undefined;
  currentBidMutationQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousMutation;

  try {
    const latestMeta = resolveLatestCurrentBidDraftMeta(fallback);
    const result = await mutation(latestMeta);
    latestSuccessfulCurrentBidMeta = readMutationResultMeta(result, latestMeta);
    return result;
  } finally {
    queuedCurrentBidMutationCount -= 1;
    if (queuedCurrentBidMutationCount === 0) {
      latestSuccessfulCurrentBidMeta = null;
    }
    releaseQueue();
  }
};

export const resetCurrentBidDraftCoordinatorForTests = () => {
  currentBidMutationQueue = Promise.resolve();
  latestSuccessfulCurrentBidMeta = null;
  queuedCurrentBidMutationCount = 0;
};
