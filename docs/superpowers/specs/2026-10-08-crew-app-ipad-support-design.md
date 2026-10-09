# Crew app iPad support

Enable the existing app on Ryan's iPad Pro 11-inch (M5), test PR crew 473006,
then install and launch on that connected iPad. Preserve current Air and Duo
layouts and concurrent edits. The existing width-based compact/tall/wide layouts
also serve iPad portrait, landscape, and resized windows; no new breakpoints.

Keep the pending universal app device family, four iPad orientations and icon
assets. Complete the shared modal orientation list and advance the app version.
Visual validation found the Schedule toolbar overlapping the iPad status bar.
Add top safe-area padding only to the wide toolbar outside the Duo side strip.
Ryan requested further iPad refinement after noticing oversized Profile visuals.
For windows with both axes at least 700pt, Profile uses a 64pt avatar (Air/Duo
remain 80pt), a horizontal identity card, naturally sized settings rows, a
centred 1040pt maximum page width and a 520pt avatar-picker limit. Compact and
Duo layouts retain their existing sizing. Native visual validation also exposed
a stale SVG percentage-sized background after rotation and the destination
information panel intercepting header taps. Use explicit live window dimensions
for both the background SVG and its painted rectangle, and render the existing
destination header above and after the scrolling panel. These preserve layout
geometry on Air/Duo. Current validation build: 162.
Do not add a global width constraint without a demonstrated fit problem: it
would affect multiple independently sized screens. Widget support is outside
this app installation scope.

Verify layout unit tests, TypeScript, a Release simulator build, and a native
XCUITest covering PR login, schedule/calendar/map/profile, portrait/landscape,
upside-down modal and TG account switching. Save and visually inspect screenshots.
Native iOS UI is driven by XCUITest rather than browser Playwright. Build a signed
Release app with bundled JavaScript, verify its device family, install and launch
only on the connected iPad. No App Store submission or iPhone installation.

Risks: existing uncommitted work shares the build; report unrelated failed checks.
Physical iPadOS is newer than Xcode's SDK, so distinguish build, install and launch
results. Split View resizing is covered by layout unit cases unless exercised in
the simulator; do not claim native multitasking coverage from those tests alone.
