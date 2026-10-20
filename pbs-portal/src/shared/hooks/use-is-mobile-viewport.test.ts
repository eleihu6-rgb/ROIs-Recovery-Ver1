import { act, renderHook } from "@testing-library/react";
import { useIsMobileViewport } from "@/shared/hooks/use-is-mobile-viewport";

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

describe("useIsMobileViewport", () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it("enables the phone layout below the md breakpoint", () => {
    setViewportWidth(390);

    const { result } = renderHook(() => useIsMobileViewport());

    expect(result.current).toBe(true);
  });

  it("keeps the scaled desktop layout at the md breakpoint and above", () => {
    setViewportWidth(768);

    const { result } = renderHook(() => useIsMobileViewport());

    expect(result.current).toBe(false);
  });

  it("reacts to viewport resizes", () => {
    setViewportWidth(1024);

    const { result } = renderHook(() => useIsMobileViewport());

    act(() => {
      setViewportWidth(420);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(true);
  });
});
