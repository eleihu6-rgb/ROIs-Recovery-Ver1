import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/shared/i18n/provider";
import {
  RuleBidAvailablePropertyRow,
  RuleBidExistingPropertyRow,
} from "@/features/rule-bids/components/rule-bid-property-table";

const layout = {
  columnGap: 14,
  fieldWidth: "240px",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 220px) minmax(0, 1fr) 280px",
  tierWidth: "280px",
};

const noop = () => undefined;

describe("Rule Bid property modifier presentation", () => {
  it("hides the AON summary label while preserving other favorite modifiers", () => {
    render(
      <I18nProvider>
        <RuleBidAvailablePropertyRow
          isDraftStructureMutationPending={false}
          isFavoriteMutationPending={false}
          layout={layout}
          property={{
            id: "favorite-201",
            favoriteKey: "favorite-201",
            propertyId: 201,
            propertyCode: 201,
            source: "favorite",
            name: "Prefer Off",
            favorited: true,
            bid: { type: "tag-list", values: ["Monday"] },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: true,
            minimumN: 2,
          }}
          onAdd={noop}
          onTierToggle={noop}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("AON")).not.toBeInTheDocument();
    expect(screen.getByText("Min 2")).toBeInTheDocument();
  });

  it("keeps the AON editor control available and interactive", async () => {
    const user = userEvent.setup();
    const onModifierChange = vi.fn();

    render(
      <I18nProvider>
        <RuleBidExistingPropertyRow
          existingBidEditMode="inline"
          isDraftStructureMutationPending={false}
          isEditing
          layout={layout}
          property={{
            id: "existing-201",
            propertyCode: 201,
            name: "Prefer Off",
            bid: { type: "tag-list", values: ["Monday"] },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: true,
            minimumN: 2,
          }}
          showModifiers
          onBidChange={noop}
          onDelete={noop}
          onEditToggle={noop}
          onTierToggle={noop}
          onModifierChange={onModifierChange}
        />
      </I18nProvider>,
    );

    const aonControl = screen.getByRole("checkbox", { name: "All or Nothing for Prefer Off" });
    expect(aonControl).toBeChecked();

    await user.click(aonControl);

    expect(onModifierChange).toHaveBeenCalledWith("existing-201", { allOrNothing: false });
  });
});
