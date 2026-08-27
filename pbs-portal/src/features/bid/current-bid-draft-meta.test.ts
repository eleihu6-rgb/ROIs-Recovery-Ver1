import {
  resetCurrentBidDraftCoordinatorForTests,
  resolveLatestCurrentBidDraftMeta,
  runCurrentBidMutation,
  type CurrentBidDraftMeta,
} from "@/features/bid/current-bid-draft-meta";
import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { linePageDataQueryKey } from "@/features/line/hooks/use-line-page-data";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import { queryClient } from "@/shared/query/query-client";

const createMeta = (
  draftVersion: number,
  overrides: Partial<CurrentBidDraftMeta> = {},
): CurrentBidDraftMeta => ({
  bidContext: "Current",
  bidId: 42,
  draftKey: "current-2026-04",
  draftVersion,
  periodCode: "2026-04",
  periodId: 12,
  ...overrides,
});

const cacheDraftMeta = (queryKey: readonly string[], draftMeta: CurrentBidDraftMeta) => {
  queryClient.setQueryData(queryKey, {
    rightPanel: { draftMeta },
  });
};

describe("current Bid draft coordinator", () => {
  beforeEach(() => {
    queryClient.clear();
    resetCurrentBidDraftCoordinatorForTests();
  });

  it("uses the newest matching Current draft version across all three category caches", () => {
    cacheDraftMeta(daysOffPageDataQueryKey, createMeta(3));
    cacheDraftMeta(pairingPageDataQueryKey, createMeta(7));
    cacheDraftMeta(linePageDataQueryKey, createMeta(5));

    expect(resolveLatestCurrentBidDraftMeta(createMeta(1))).toMatchObject({
      draftVersion: 7,
      periodCode: "2026-04",
    });
  });

  it("does not borrow a version from another bid or period", () => {
    cacheDraftMeta(daysOffPageDataQueryKey, createMeta(9, { bidId: 99 }));
    cacheDraftMeta(pairingPageDataQueryKey, createMeta(8, { periodCode: "2026-05" }));

    expect(resolveLatestCurrentBidDraftMeta(createMeta(2))).toMatchObject({
      bidId: 42,
      draftVersion: 2,
      periodCode: "2026-04",
    });
  });

  it("serializes cross-category writes and passes the first response version to the next write", async () => {
    const receivedVersions: number[] = [];
    let releaseFirstMutation: (() => void) | undefined;

    const first = runCurrentBidMutation(createMeta(1), async (meta) => {
      receivedVersions.push(meta.draftVersion);
      await new Promise<void>((resolve) => {
        releaseFirstMutation = resolve;
      });
      return { draftVersion: 2 };
    });
    const second = runCurrentBidMutation(createMeta(1), async (meta) => {
      receivedVersions.push(meta.draftVersion);
      return { draftVersion: 3 };
    });

    await Promise.resolve();
    expect(receivedVersions).toEqual([1]);

    releaseFirstMutation?.();
    await Promise.all([first, second]);

    expect(receivedVersions).toEqual([1, 2]);
  });
});
