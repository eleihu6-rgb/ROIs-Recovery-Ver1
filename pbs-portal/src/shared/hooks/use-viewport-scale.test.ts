import { act, renderHook } from "@testing-library/react";
import { useViewportScale } from "@/shared/hooks/use-viewport-scale";

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

describe("useViewportScale", () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it("keeps the workspace at full scale when the viewport is wider than the minimum", () => {
    setViewportWidth(1600);

    const { result } = renderHook(() =>
      useViewportScale({
        canvasWidth: 1440,
        minViewportWidth: 1280,
      }),
    );

    expect(result.current.scale).toBe(1);
    expect(result.current.canvasWidth).toBe(1440);
    expect(result.current.viewportWidth).toBe(1600);
  });

  it("scales the workspace canvas proportionally below the minimum width", () => {
    setViewportWidth(1120);

    const { result } = renderHook(() =>
      useViewportScale({
        canvasWidth: 1440,
        minViewportWidth: 1280,
      }),
    );

    expect(result.current.scale).toBeCloseTo(1120 / 1440, 5);
    expect(result.current.canvasWidth).toBeCloseTo(1120, 5);
    expect(result.current.canvasWidth).toBeLessThanOrEqual(result.current.viewportWidth);
    expect(result.current.viewportWidth).toBe(1120);
  });

  it("updates the scale after a resize event", () => {
    setViewportWidth(1440);

    const { result } = renderHook(() =>
      useViewportScale({
        canvasWidth: 1440,
        minViewportWidth: 1280,
      }),
    );

    act(() => {
      setViewportWidth(960);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.scale).toBeCloseTo(960 / 1440, 5);
    expect(result.current.canvasWidth).toBeCloseTo(960, 5);
    expect(result.current.canvasWidth).toBeLessThanOrEqual(result.current.viewportWidth);
    expect(result.current.viewportWidth).toBe(960);
  });
});
