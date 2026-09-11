// Horizontal scroll helper shared by the alarm offset pickers (TripCards adjust
// sheet + Profile Clock Setup). Given the active chip's position/width and the
// visible strip width, returns the scroll x-offset that centres that chip — so
// the CURRENT value is visible on open instead of starting off-screen.
export function centerOffset(chipX: number, chipW: number, stripW: number): number {
  return Math.max(0, chipX + chipW / 2 - stripW / 2);
}
