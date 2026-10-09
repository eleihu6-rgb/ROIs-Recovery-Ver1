# Crew app check-in layout and location map

## Scope

On wide screens, align the timing and map cards in one row and place the duty table across the width below them. Keep the compact screen's vertical order. The map should show actual streets around the portal's check-in location, with a visible marker and the portal's allowed radius when supplied.

## Data and implementation

- `locationVoList` is the portal's explicit check-in point and radius. Prefer its valid coordinates over the top-level `latitude`/`longitude`; use the departure airport only when the portal supplies no usable check-in point.
- The Schedule route map is an offline SVG and has no Mapbox token. The old HTML mock has a placeholder token only. Use a token-free native map for this delivery, with Apple Maps on iOS, so the crew can pan/zoom real map detail. A future Mapbox provider requires a supplied public token and native SDK configuration.
- Style the native street map as a muted dark map to match the Schedule route map. Tint the streets, check-in radius, map pin, badges, and zoom controls from the active carrier palette, including a crew-selected Appearance theme. Keep the streets and Apple attribution readable.
- Do not show a fabricated crew position. The check-in action continues to follow its existing time-window rule; adding location enforcement or actual GPS is a separate business decision.

## Verification

Focused Jest coverage for location priority, map marker/radius, wide layout, and PR-to-TG account switching. Validate the PR view on the Duo simulator and inspect a screenshot from that run. Record separate TypeScript and TG simulator results when available.
