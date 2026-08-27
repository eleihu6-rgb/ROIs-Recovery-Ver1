import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  PairingResultFilterMultiSelect,
  type PairingResultFilterOptionPage,
} from "@/features/pairing/components/pairing-result-filter-multi-select";

const renderRemoteSelect = (
  loadOptionPage: (
    query: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<PairingResultFilterOptionPage>,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Harness = () => {
    const [selectedValues, setSelectedValues] = useState<string[]>([]);

    return (
      <PairingResultFilterMultiSelect
        ariaLabel="Filter results by pairing number"
        emptyLabel="No matching Pairing Numbers"
        errorLabel="Unable to load Pairing Numbers"
        label="Pairing Number"
        loadingLabel="Loading Pairing Numbers..."
        placeholder="Search Pairing Number"
        queryKey={["test", "pairing-number-filter-options"]}
        selectedValues={selectedValues}
        testId="pairing-number-filter"
        loadOptionPage={loadOptionPage}
        onChange={setSelectedValues}
      />
    );
  };

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );

  return { queryClient };
};

describe("PairingResultFilterMultiSelect", () => {
  it("loads defaults without input and fetches the next cursor page on scroll", async () => {
    const loadOptionPage = vi.fn(async (_query: string, cursor?: string) => cursor
      ? {
        options: [{ value: "V4146", label: "V4146" }],
        nextCursor: null,
        totalCount: 3,
      }
      : {
        options: [
          { value: "M4959", label: "M4959" },
          { value: "M4960", label: "M4960" },
        ],
        nextCursor: "page-2",
        totalCount: 3,
      });
    const user = userEvent.setup();
    renderRemoteSelect(loadOptionPage);

    await user.click(screen.getByRole("combobox", { name: "Filter results by pairing number" }));

    expect(await screen.findByRole("option", { name: "M4959" })).toHaveAttribute("aria-setsize", "3");
    expect(screen.getByTestId("pairing-number-filter-option-M4959-label")).toHaveClass("min-w-0");
    expect(screen.queryByTestId("pairing-number-filter-option-M4959-check")).not.toBeInTheDocument();
    expect(loadOptionPage).toHaveBeenNthCalledWith(1, "", undefined, expect.any(AbortSignal));

    fireEvent.scroll(screen.getByRole("listbox", { name: "Pairing Number options" }));

    expect(await screen.findByRole("option", { name: "V4146" })).toHaveAttribute("aria-posinset", "3");
    expect(loadOptionPage).toHaveBeenNthCalledWith(2, "", "page-2", expect.any(AbortSignal));
  });

  it("keeps virtualized options accessible to keyboard selection", async () => {
    const options = Array.from({ length: 100 }, (_, index) => {
      const value = `T${String(index + 1).padStart(4, "0")}`;
      return { value, label: value };
    });
    const loadOptionPage = vi.fn(async () => ({
      options,
      nextCursor: "page-2",
      totalCount: 10_000,
    }));
    const user = userEvent.setup();
    renderRemoteSelect(loadOptionPage);
    const input = screen.getByRole("combobox", { name: "Filter results by pairing number" });

    await user.click(input);
    await screen.findByRole("option", { name: "T0001" });
    expect(screen.getAllByRole("option").length).toBeLessThan(20);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("button", { name: "Remove T0001 from Pairing Number" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "T0001" }))
      .toHaveClass("bg-[#eef2ff]", "hover:bg-[#e4e8ff]");
    expect(screen.getByTestId("pairing-number-filter-option-T0001-label"))
      .toHaveClass("text-[#6467d1]");
    expect(screen.getByTestId("pairing-number-filter-option-T0001-check")).toHaveClass("ml-auto");

    await user.keyboard("{End}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-99"));
    expect(loadOptionPage).toHaveBeenCalledTimes(2);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Pairing Number options" })).not.toBeInTheDocument();
  });

  it("shows a retry action for the initial request and cancels in-flight work on close", async () => {
    let attempts = 0;
    let aborted = false;
    const loadOptionPage = vi.fn((_query: string, _cursor: string | undefined, signal: AbortSignal) => {
      attempts += 1;

      if (attempts === 1) {
        return Promise.reject(new Error("temporary failure"));
      }

      return new Promise<PairingResultFilterOptionPage>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
        window.setTimeout(() => resolve({
          options: [{ value: "M4959", label: "M4959" }],
          nextCursor: null,
          totalCount: 1,
        }), 1_000);
      });
    });
    const user = userEvent.setup();
    const { queryClient } = renderRemoteSelect(loadOptionPage);

    await user.click(screen.getByRole("combobox", { name: "Filter results by pairing number" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(aborted).toBe(true));
    await waitFor(() => {
      expect(queryClient.getQueriesData({
        queryKey: ["test", "pairing-number-filter-options"],
      })).toEqual([]);
    });
  });
});
