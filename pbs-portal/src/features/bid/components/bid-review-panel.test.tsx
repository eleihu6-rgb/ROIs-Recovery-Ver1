import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BidReviewPanel,
  buildBidReviewItems,
} from "@/features/bid/components/bid-review-panel";
import { tierPageData } from "@/features/tier/mock";
import type { TierPageData } from "@/features/tier/types";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";

const buildReviewData = (): TierPageData => ({
  ...tierPageData,
  diagnostics: [
    {
      id: "t1-only",
      code: "testT1",
      severity: "warning",
      message: "T1 only review",
      tiers: ["T1"],
      itemIds: [],
    },
    {
      id: "mixed-legacy",
      code: "testLegacyMixed",
      severity: "warning",
      message: "T1 mixed legacy review",
      tiers: ["T1", "T12"],
      itemIds: [],
    },
    {
      id: "t2-only",
      code: "testT2",
      severity: "info",
      message: "T2 only review",
      tiers: ["T2"],
      itemIds: [],
    },
    {
      id: "global",
      code: "testGlobal",
      severity: "info",
      message: "Global review",
      tiers: [],
      itemIds: [],
    },
    {
      id: "pool-empty",
      code: "pairingPoolEmpty",
      severity: "warning",
      message: "Pool diagnostic should stay on Tier",
      tiers: ["T1"],
      itemIds: [],
    },
  ],
  legacyItems: [
    {
      id: "legacy-only",
      groupKey: "legacy-only",
      bidType: "Pairing",
      action: "Award",
      label: "Legacy Pairing",
      readableText: "Legacy T12 pairing",
      tiers: ["T12"],
      conditions: [],
      warningCode: "unsupportedTier",
      isEditable: false,
    },
  ],
  warnings: [
    {
      code: "warning-all",
      message: "Global warning",
    },
  ],
});

const renderPanel = (data: TierPageData, activeTier = "T1") =>
  render(
    <ScaledPageCanvas
      canvasTestId="scaled-canvas"
      designHeight={968}
      designWidth={1888}
    >
      <BidReviewPanel activeTier={activeTier} data={data} />
    </ScaledPageCanvas>,
  );

let observedElement: Element | null = null;
let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock implements ResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn((element: Element) => {
    observedElement = element;
  });
  unobserve = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }
}

const setTitleDimensions = (title: HTMLElement, clientWidth: number, scrollWidth: number) => {
  Object.defineProperties(title, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
  act(() => {
    resizeObserverCallback?.([], {} as ResizeObserver);
  });
};

describe("BidReviewPanel", () => {
  beforeEach(() => {
    observedElement = null;
    resizeObserverCallback = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters review items by active Tx and keeps global or legacy-only items visible", () => {
    const data = buildReviewData();

    expect(buildBidReviewItems(data, "T1").map((item) => item.title)).toEqual([
      "T1 only review",
      "T1 mixed legacy review",
      "Global review",
      "Global warning",
      "Legacy T12 pairing",
    ]);
    expect(buildBidReviewItems(data, "T2").map((item) => item.title)).toEqual([
      "T2 only review",
      "Global review",
      "Global warning",
      "Legacy T12 pairing",
    ]);
  });

  it("does not migrate pairing pool diagnostics into Bid Review", () => {
    const data = {
      ...tierPageData,
      diagnostics: [{
        id: "pool-empty",
        code: "pairingPoolEmpty",
        severity: "warning" as const,
        message: "T1 pairing set is empty. Review whether this Tx is too restrictive or conflicting.",
        tiers: ["T1"],
        itemIds: [],
      }],
      legacyItems: [],
      warnings: [],
    };

    expect(buildBidReviewItems(data, "T1")).toEqual([]);
  });

  it("renders an empty state when the active Tx has no review items", () => {
    renderPanel({
      ...tierPageData,
      diagnostics: [],
      legacyItems: [],
      warnings: [],
    });

    expect(screen.getByTestId("bid-review-panel")).toHaveTextContent("No review warnings for T1.");
  });

  it("does not repeat the active Tx beside the Bid Review heading", () => {
    renderPanel(buildReviewData(), "T1");

    const panel = screen.getByTestId("bid-review-panel");

    expect(within(panel).getByText("BID REVIEW")).toBeInTheDocument();
    expect(within(panel).queryByText("T1", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the complete review message in a tooltip only when the title is truncated", async () => {
    const user = userEvent.setup();
    const data = buildReviewData();
    data.diagnostics = [data.diagnostics[0]];
    data.legacyItems = [];
    data.warnings = [];

    renderPanel(data);

    const title = screen.getByTestId("bid-review-chip-title");
    expect(observedElement).toBe(title);

    setTitleDimensions(title, 240, 240);
    expect(title).not.toHaveAttribute("tabindex");
    await user.hover(title);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.unhover(title);

    setTitleDimensions(title, 120, 240);
    expect(title).toHaveAttribute("tabindex", "0");
    await user.hover(title);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("T1 only review");
    await user.unhover(title);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("opens a truncated review tooltip from the keyboard and closes it without moving focus", async () => {
    const user = userEvent.setup();
    const data = buildReviewData();
    data.diagnostics = [data.diagnostics[0]];
    data.legacyItems = [];
    data.warnings = [];

    renderPanel(data);

    const title = screen.getByTestId("bid-review-chip-title");
    setTitleDimensions(title, 120, 240);
    await user.tab();

    expect(title).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("T1 only review");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(title).toHaveFocus();

    await user.tab();
    act(() => title.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("T1 only review");
    act(() => title.blur());
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(title).not.toHaveFocus();
  });

  it("shows the remaining review items in a scaled popover", async () => {
    const user = userEvent.setup();

    renderPanel(buildReviewData());

    await waitFor(() => {
      expect(screen.getByTestId("scaled-page-dialog-portal-root")).toBeInTheDocument();
    });
    expect(screen.getByTestId("bid-review-more-button")).toHaveTextContent("+2 more");

    await user.click(screen.getByTestId("bid-review-more-button"));

    const popover = await screen.findByTestId("bid-review-popover");

    expect(popover).toBeInTheDocument();
    expect(within(popover).getAllByTestId("bid-review-popover-row")).toHaveLength(5);
    expect(within(popover).getByText("T1", { exact: true })).toBeInTheDocument();
    expect(within(popover).getByText("T1 mixed legacy review")).toBeInTheDocument();
    expect(within(popover).getByText("Legacy T12 pairing")).toBeInTheDocument();
    expect(screen.getByTestId("bid-review-popover-scroll")).toHaveClass("overflow-y-auto", "overscroll-contain");
  });

  it("displays the internal Line module as Roster in chips and the popover", async () => {
    const user = userEvent.setup();
    const data = buildReviewData();
    data.diagnostics = [
      {
        id: "line-review",
        code: "lineReview",
        severity: "warning",
        message: "Review this roster preference",
        tiers: ["T1"],
        groupKey: "line-credit",
        itemIds: ["line-credit-t1"],
      },
      ...data.diagnostics,
    ];

    renderPanel(data);

    const panel = screen.getByTestId("bid-review-panel");
    expect(within(panel).getByText("Roster", { exact: true })).toBeInTheDocument();
    expect(within(panel).queryByText("Line", { exact: true })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("bid-review-more-button"));

    const popover = await screen.findByTestId("bid-review-popover");
    expect(within(popover).getByText("Roster", { exact: true })).toBeInTheDocument();
    expect(within(popover).queryByText("Line", { exact: true })).not.toBeInTheDocument();
  });
});
