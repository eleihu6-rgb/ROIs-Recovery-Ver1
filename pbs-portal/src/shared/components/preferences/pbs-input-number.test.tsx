import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PbsInputNumber } from "./pbs-input-number";

describe("PbsInputNumber", () => {
  it("starts a nullable value at min when incremented and disables decrement at min", async () => {
    const user = userEvent.setup();

    const Harness = () => {
      const [value, setValue] = useState<number | null>(null);
      return <PbsInputNumber ariaLabel="Required quantity" max={3} min={1} value={value} onChange={setValue} />;
    };

    render(<Harness />);

    const input = screen.getByRole("spinbutton", { name: "Required quantity" });
    expect(screen.getByRole("button", { name: "Decrease Required quantity" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Increase Required quantity" }));

    expect(input).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Decrease Required quantity" })).toBeDisabled();
  });

  it("allows temporary empty input and clamps an out-of-range value on blur", async () => {
    const user = userEvent.setup();

    const Harness = () => {
      const [value, setValue] = useState<number | null>(2);
      return <PbsInputNumber ariaLabel="Required quantity" max={3} min={1} value={value} onChange={setValue} />;
    };

    render(<Harness />);

    const input = screen.getByRole("spinbutton", { name: "Required quantity" });
    await user.clear(input);
    expect(input).toHaveValue(null);

    await user.type(input, "9");
    await user.tab();

    expect(input).toHaveValue(3);
  });
});
