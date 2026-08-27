import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierToggleGroup } from "@/shared/components/tiers";

describe("TierToggleGroup", () => {
  it("does not emit toggles when rendered in readonly mode", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <TierToggleGroup
        readonly
        options={[
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ]}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Toggle T1" }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
