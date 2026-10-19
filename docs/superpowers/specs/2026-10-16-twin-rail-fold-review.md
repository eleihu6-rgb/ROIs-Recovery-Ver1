# Twin Rail review disclosure

User request: the always-open iPad review occupies half the screen while browsing. Collapse it initially and only show it after selecting duties to swap.

Scope: Twin Rail only; no API, legality or other-concept changes. Brainstorming skill is not available in this session; this records the bounded implementation design.

On large layouts, the rails use the full content width until both Give and Take contain a duty. Selecting a complete pair opens review automatically. The user can Hide review without losing selections or note, then reopen with Review. Removing one side or clearing returns to full-width browsing. A newly completed selection opens review again. Wide layouts cap the side review at 320pt / 40% so the timeline remains primary. Tall layouts keep the existing vertical review arrangement, now conditional.

Small phones retain their existing explicit Review navigation and compact tray. Duty pucks remain 40pt high, with existing horizontal zoom and adaptive text. No automatic submit or legality change.

Verification: focused Jest disclosure/selection/note tests for iPad and tall layouts, existing phone regression, TypeScript, UI-standard gate; native iPad real-UI selection/hide/reopen/clear and account isolation with screenshots. One simulator at a time. No TestFlight deployment or Git operations.
