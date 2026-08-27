import { resolveScaledDropdownPosition } from "@/shared/lib/scaled-dropdown-position";

const baseInput = {
  anchorLayoutWidth: 300,
  anchorRect: {
    bottom: 140,
    left: 100,
    right: 400,
    top: 100,
    width: 300,
  },
  designGap: 6,
  designHeaderHeight: 42,
  designMaxOptionsHeight: 260,
  viewportHeight: 800,
  viewportMargin: 12,
  viewportWidth: 1000,
};

describe("resolveScaledDropdownPosition", () => {
  it("places an unscaled dropdown below the trigger when it fits", () => {
    expect(resolveScaledDropdownPosition(baseInput)).toEqual({
      designMaxOptionsHeight: 260,
      designMaxPopupHeight: 642,
      designWidth: 300,
      openAbove: false,
      scale: 1,
      viewportBottom: null,
      viewportLeft: 100,
      viewportTop: 146,
    });
  });

  it("keeps design dimensions while matching a half-scale trigger", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorLayoutWidth: 400,
      anchorRect: {
        bottom: 120,
        left: 50,
        right: 250,
        top: 100,
        width: 200,
      },
    });

    expect(position.scale).toBe(0.5);
    expect(position.designWidth).toBe(400);
    expect(position.viewportTop).toBe(123);
    expect(position.designMaxOptionsHeight).toBe(260);
  });

  it("attaches above the trigger when the lower side cannot fit the desired height", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorRect: {
        bottom: 670,
        left: 100,
        right: 400,
        top: 650,
        width: 300,
      },
      viewportHeight: 700,
    });

    expect(position.openAbove).toBe(true);
    expect(position.viewportTop).toBeNull();
    expect(position.viewportBottom).toBe(56);
    expect(position.designMaxOptionsHeight).toBe(260);
  });

  it("uses the larger available side and scrolls options when neither side fits", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorRect: {
        bottom: 120,
        left: 100,
        right: 400,
        top: 100,
        width: 300,
      },
      viewportHeight: 220,
    });

    expect(position.openAbove).toBe(false);
    expect(position.designMaxPopupHeight).toBe(82);
    expect(position.designMaxOptionsHeight).toBe(40);
  });

  it("allows the popup to shrink below its header height on an extremely short viewport", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorRect: {
        bottom: 40,
        left: 100,
        right: 400,
        top: 20,
        width: 300,
      },
      viewportHeight: 70,
    });

    expect(position.designMaxPopupHeight).toBe(12);
    expect(position.designMaxOptionsHeight).toBe(0);
  });

  it("collapses safely when the viewport is narrower than both margins", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorRect: {
        bottom: 140,
        left: 0,
        right: 20,
        top: 100,
        width: 20,
      },
      viewportWidth: 20,
    });

    expect(position.viewportLeft).toBe(12);
    expect(position.designWidth).toBe(0);
  });

  it("falls back to scale one when the trigger has no usable layout width", () => {
    const position = resolveScaledDropdownPosition({
      ...baseInput,
      anchorLayoutWidth: 0,
    });

    expect(position.scale).toBe(1);
    expect(position.designWidth).toBe(300);
  });
});
