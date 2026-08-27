import { fireEvent, render, screen, within } from "@testing-library/react";
import { PairingCalendarBidDetailDialog } from "@/features/dashboard/components/pairing-calendar-bid-detail-dialog";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";

describe("PairingCalendarBidDetailDialog", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders pairing bid summary as a compact grid with compact dates", () => {
    document.body.style.overflow = "auto";
    const onClose = vi.fn();

    const { unmount } = render(
      <ScaledPageCanvas designHeight={968} designWidth={1888}>
        <PairingCalendarBidDetailDialog
        canSave
        canEditTiers
        detailError={null}
        detailRows={[
          {
            pairingNumber: "C4101",
            propertyGroupKey: "group-4101",
            rowKey: "group-4101:C4101:20260408",
            internalId: "3055",
            tier: "T2",
            originDate: "20260408",
            startDate: "20260408",
            endDate: "20260408",
            mode: "Specific Date",
          },
          {
            pairingNumber: "C4101",
            propertyGroupKey: "group-4101",
            rowKey: "group-4101:C4101:20260408-20260410",
            internalId: "3055",
            tier: "T2",
            originDate: "20260408",
            startDate: "20260408",
            endDate: "20260410",
            mode: "Specific Date",
          },
        ]}
        detailResults={[
          {
            id: "3055",
            pairingId: "C4101",
            pairingNumber: "C4101",
            base: "YVR",
            startDateLabel: "Apr 8, 2026",
            compositionLabel: "CA(1)",
            reportTime: "0630",
            priorityLabel: "P2",
            prioritySequence: "01",
            totalBlock: "1214",
            totalCredit: "765",
            totalDp: "9:30",
            totalPay: "765",
            activeDates: ["2026-04-08"],
            legs: [
              {
                id: "3055-1-1",
                day: 1,
                dutyDate: "0408",
                dutyFdp: "0830",
                dutyFlyingHour: "0531",
                dutyHour: "0930",
                dutyCredit: "0600",
                flightNumber: "2810",
                departureStation: "YVR",
                arrivalStation: "CUN",
                departureTime: "0730",
                arrivalTime: "1301",
                blockTime: "0531",
                equipment: "7M8",
                ganttQual: "FLY",
                ganttAirline: "F8",
                ganttFlight: "2810",
                ganttFleet: "7M8",
                ganttAcc: "D",
                ganttRef: "-240",
                ganttDep: "YVR",
                ganttPickup: "06:15",
                ganttReport: "06:30",
                ganttStd: "07:30",
                ganttAtd: "07:35",
                ganttArr: "CUN",
                ganttSta: "13:01",
                ganttAta: "13:05",
                ganttDropoff: "13:20",
                ganttGroundTime: "1:02",
                ganttBlockHour: "5:31",
                ganttFlightTime: "5:31",
                ganttMinimumRest: "10:00|10:00",
                ganttDuty: "LO 1 · FDP 8:30",
              },
            ],
          },
        ]}
        error={null}
        isDetailLoading={false}
        isLoading={false}
        isPending={false}
        isTierEditingDisabled={false}
        pairingNumber="C4101"
        selectedDetailRowKey={null}
        selectedTiers={["T2"]}
        showEditSelector={false}
        tiers={["T1", "T2"]}
        onClearTiers={vi.fn()}
        onClose={onClose}
        onDetailRowSelect={vi.fn()}
        onSave={vi.fn()}
        onTierToggle={vi.fn()}
        />
      </ScaledPageCanvas>,
    );

    const summaryGrid = screen.getByTestId("pairing-bid-summary-grid");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("C4101 #3055")).toBeInTheDocument();
    expect(within(summaryGrid).getByText("PAIRING")).toBeInTheDocument();
    expect(within(summaryGrid).getByText("START")).toBeInTheDocument();
    expect(within(summaryGrid).getByText("END")).toBeInTheDocument();
    expect(within(summaryGrid).queryByText("EDIT")).not.toBeInTheDocument();
    expect(within(summaryGrid).getAllByText("C4101")).toHaveLength(2);
    expect(within(summaryGrid).getAllByText("20260408").length).toBeGreaterThanOrEqual(3);
    expect(within(summaryGrid).getByText("20260410")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Pairing Bid" });
    const overlay = screen.getByTestId("pairing-bid-detail-overlay");

    expect(screen.getByTestId("scaled-page-dialog-portal-root")).toContainElement(overlay);
    expect(overlay.parentElement).not.toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    expect(overlay.className).toContain("justify-center");
    expect(overlay.className).toContain("overflow-hidden");
    expect(overlay.className).toContain("inset-0");
    expect(overlay.className).not.toContain("justify-start");
    expect(overlay.className).not.toContain("bottom-4");
    expect(dialog.className).toContain("!w-[880px]");
    expect(dialog.className).toContain("!max-h-[calc(var(--portal-page-shell-height)-32px)]");
    expect(dialog.className).not.toContain("w-[min(1600px,calc(100vw-96px))]");
    expect(dialog).not.toHaveAttribute("style");
    expect(screen.getByTestId("pairing-bid-detail-scroll-region").className).toContain("overflow-x-auto");
    expect(screen.getByText("QUAL")).toBeInTheDocument();
    expect(screen.getByText("ALN")).toBeInTheDocument();
    expect(screen.getByText("Flight")).toBeInTheDocument();
    expect(screen.getByText("Fleet")).toBeInTheDocument();
    expect(screen.getByText("ACC")).toBeInTheDocument();
    expect(screen.getByText("Ref")).toBeInTheDocument();
    expect(screen.getByText("DEP")).toBeInTheDocument();
    expect(screen.getByText("PCK")).toBeInTheDocument();
    expect(screen.getByText("RPT")).toBeInTheDocument();
    expect(screen.getByText("STD")).toBeInTheDocument();
    expect(screen.getByText("ATD")).toBeInTheDocument();
    expect(screen.getByText("ARR")).toBeInTheDocument();
    expect(screen.getByText("STA")).toBeInTheDocument();
    expect(screen.getByText("ATA")).toBeInTheDocument();
    expect(screen.getByText("DRP")).toBeInTheDocument();
    expect(screen.getByText("GT")).toBeInTheDocument();
    expect(screen.getByText("BH")).toBeInTheDocument();
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getByText("MRT")).toBeInTheDocument();
    expect(screen.getByText("Duty")).toBeInTheDocument();
    expect(screen.getByText("FLY")).toBeInTheDocument();
    expect(screen.getByText("F8")).toBeInTheDocument();
    expect(screen.getByText("2810")).toBeInTheDocument();
    expect(screen.getByText("-240")).toBeInTheDocument();
    expect(screen.getByText("06:15")).toBeInTheDocument();
    expect(screen.getByText("07:35")).toBeInTheDocument();
    expect(screen.getAllByText("5:31").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("10:00|10:00")).toBeInTheDocument();
    expect(screen.getByText("LO 1 · FDP 8:30")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("APPLY TO TIERS")).toBeInTheDocument();
    expect(screen.queryByText("APPLY TO TIERS · REQUIRED")).not.toBeInTheDocument();
    expect(screen.getByText("Apr 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Composition")).toBeInTheDocument();
    expect(screen.getByText("CA(1)")).toBeInTheDocument();
    expect(screen.getByText("Total Credit")).toBeInTheDocument();
    expect(screen.getByText("12:45")).toBeInTheDocument();
    expect(screen.getByText("Total BH")).toBeInTheDocument();
    expect(screen.getByText("12:14")).toBeInTheDocument();
    expect(screen.getByText("Total DP")).toBeInTheDocument();
    expect(screen.getByText("9:30")).toBeInTheDocument();
    expect(screen.queryByText("REPORT")).not.toBeInTheDocument();
    expect(screen.queryByText("TBLK")).not.toBeInTheDocument();
    expect(screen.queryByText("TCRD")).not.toBeInTheDocument();
    expect(screen.queryByText("TPAY")).not.toBeInTheDocument();
    expect(screen.queryByText("Day")).not.toBeInTheDocument();
    expect(screen.queryByText("Credit")).not.toBeInTheDocument();
    expect(screen.queryByText("DAY")).not.toBeInTheDocument();
    expect(screen.queryByText("FDP")).not.toBeInTheDocument();
    expect(screen.queryByText("F/H")).not.toBeInTheDocument();
    expect(screen.queryByText("D/H")).not.toBeInTheDocument();
    expect(screen.queryByText("CRD")).not.toBeInTheDocument();
    expect(screen.queryByText("FLTN")).not.toBeInTheDocument();
    expect(screen.queryByText("DPS")).not.toBeInTheDocument();
    expect(screen.queryByText("ARS")).not.toBeInTheDocument();
    expect(screen.queryByText("BLKT")).not.toBeInTheDocument();
    expect(screen.queryByText("EQP")).not.toBeInTheDocument();

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();

    expect(document.body.style.overflow).toBe("auto");
  });

  it("hides tier editing controls in readonly detail mode", () => {
    render(
      <PairingCalendarBidDetailDialog
        canSave={false}
        canEditTiers={false}
        detailError={null}
        detailRows={[
          {
            pairingNumber: "C4101",
            propertyGroupKey: "group-4101",
            rowKey: "group-4101:C4101:20260408",
            internalId: "3055",
            tier: "T2",
            originDate: "20260408",
            startDate: "20260408",
            endDate: "20260408",
            mode: "Specific Date",
          },
        ]}
        detailResults={[]}
        error="Unable to find this pairing bid in the current draft."
        isDetailLoading={false}
        isLoading={false}
        isPending={false}
        isTierEditingDisabled
        pairingNumber="C4101"
        selectedDetailRowKey={null}
        selectedTiers={["T2"]}
        showEditSelector={false}
        tiers={["T1", "T2"]}
        onClearTiers={vi.fn()}
        onClose={vi.fn()}
        onDetailRowSelect={vi.fn()}
        onSave={vi.fn()}
        onTierToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Pairing Bid" })).toBeInTheDocument();
    expect(screen.queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAVE BID" })).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to find this pairing bid in the current draft.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByTestId("scaled-page-dialog-portal-root")).not.toBeInTheDocument();
  });
});
