import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EfficientFlyingEditor } from "@/features/pairing/components/efficient-flying-editor";

describe("EfficientFlyingEditor", () => {
  it("uses one mode state for selection, explanation, and canonical payload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EfficientFlyingEditor
        configStatus="ready"
        percentile={20}
        value={{ type: "efficient-flying-preference", mode: "efficient" }}
        onChange={onChange}
        onValidityChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Efficient flying" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Top 20% by average daily credit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inefficient flying" }));

    expect(onChange).toHaveBeenCalledWith({
      type: "efficient-flying-preference",
      mode: "inefficient",
    });
  });

  it("shows unavailable configuration and keeps both choices disabled", () => {
    render(
      <EfficientFlyingEditor
        configStatus="unavailable"
        value={{ type: "efficient-flying-preference", mode: "efficient" }}
        disabled
        onChange={vi.fn()}
        onValidityChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Efficient flying configuration is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Efficient flying" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inefficient flying" })).toBeDisabled();
  });
});
