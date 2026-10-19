# Crew Matrix pinch height

Scope: crew-app Duty Swap Matrix only. Two fingers spreading/closing resize day rows continuously between the existing compact height and 160 points. Mine, dates, candidate duties, and backgrounds share the same height. Single-finger scrolling and duty selection remain available; pinch must not select duties. Keep the top visible date stable when scaling. Zoom is local to the mounted Matrix.

Pucks retain readable font sizes, budget complete lines including padding and borders, and reveal code, route/time, layover, credit and fleet as space allows. Narrow columns may wrap details when expanded. No backend or swap business changes.

Risks: nested native scroll responder ownership, accidental selection, font scaling, and narrow columns. Verification: fixture-based Jest interaction and layout regression, TypeScript, UI standards, real UI Playwright if a native bridge exists, and TG/PR simulator checks. Native gesture validation is required to confirm scroll arbitration.
