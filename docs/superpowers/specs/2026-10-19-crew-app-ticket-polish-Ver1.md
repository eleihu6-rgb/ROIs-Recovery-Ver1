# Duty Swap Ticket polish

Authorized by Ryan's 19 October screenshots and five requested changes.

## Flow and scope

Keep Matrix, Market and Twin Rail behavior unchanged. Ticket retains four stages: 1 Give, 2 Want, 3 Match, 4 Send. Every stage number and title remains readable, with the active stage on a solid carrier-themed surface. Back preserves the draft; Next validates each stage. Give's Back exits; Send's forward action performs the existing legality check and submission.

Give starts with no implicit selection and supports toggling one or multiple unlocked duties. Selection does not advance. Want retains the selected-duty summary while using the existing target filters. Keep selected duty objects across target searches because narrowing target dates must not silently change the offered duties. Search changes invalidate the chosen match. Failed/loading searches cannot advance or expose stale matches.

Match lists one candidate per crew and shows the actual take bundle for all selected give duties. Selected candidate remains on Match until Next. Show You give once alongside You take candidates; Send uses one review, with give/take side by side on wide layouts and stacked on compact layouts. Never render two tickets or two send buttons. Existing portal checks remain authoritative; no new legality inference.

## Modules and risks

TicketScreen and an optional SearchForm summary slot; existing submitBody accepts arrays. Preserve unrelated worktree changes. Clear draft when airline/account changes. Multiple disjoint give dates may increase the take bundle and must be visible before sending. Review and submit use identical duty arrays.

## Verification

Focused Jest covers all six reference viewports, multi-selection, Back/Next, search errors, single review, and multi-duty payload. Run TypeScript, UI gate, diff check. Validate mockup through browser/Playwright with screenshots. Native simulator validation required in Air, Duo, iPad order with PR/TG; disclose any unavailable runtime or authentication blocker. Save updated standalone mockup locally without replacing Ver1.
