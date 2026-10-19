# Crew App matrix selection guides

Extend the Duty Swap Twin Rail selection-guide behavior to Matrix mode. Matrix
time runs vertically, so selecting one or more of the crew member's own duties
draws two horizontal purple dashed guides from the selected Mine block boundary
through the date and candidate columns. The guides mark the outer visual start
and end of the selected set, track matrix pinch height and vertical scrolling,
ignore touches, and disappear after deselect or Clear.

Candidate selections do not move the guide bounds: the purpose is to compare
candidate duties against what the crew proposes to give. Locked duties remain
unselectable. A selected duty outside the current date window creates no guide.
The overlay is shared across the viewport rather than repeated per crew column,
preserving the matrix's virtualized first-paint behavior.

Verification covers all six Crew App reference viewport geometries, single and
multiple own-duty selections, clear, pinch tracking, PR-to-TG account isolation,
TypeScript, the Crew App UI style gate, and native simulator screenshots. The
native React Native screen has no browser/Playwright surface, so XCUITest is the
real-UI validation path.
