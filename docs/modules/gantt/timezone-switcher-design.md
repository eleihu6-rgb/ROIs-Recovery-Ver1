# Timezone Switcher Design Spec

> Display timezone selector for Gantt pane — converts all timestamps to user-selected timezone.

## Implementation Status

**Completed:** 2026-05-09

**Component Location:** `gantt/src/components/common/timezone-switcher.tsx`

**Integration:** `gantt/src/components/shell/gantt-sub-toolbar.tsx` (toolbar, after Rule Group Selector)

## UI Component

**Location:** GanttSubToolbar, after Rule Group Selector.

**Trigger:** Button `UTC · UTC (UTC+0)` (default) → dropdown opens.

**Dropdown Sections:**
1. **Airline Bases** (★ icon) — airports marked as `isBase: true` in DB
2. **Other Airports** (✈ icon) — other airports from roster/pairing data
3. **UTC** (🌐 icon) — always available as fallback

**Selection Behavior:**
- Click option → closes dropdown, updates all timestamps
- Selected item shows ✓ checkmark
- Outside click → closes dropdown

## Data Flow

**API Endpoint:** `GET /fpqe/live/base/timezone-options`

**Backend Route:** `/base/timezone-options` (registered in `routes/base/index.ts`)

**Authentication:** Requires JWT token (Authorization: Bearer header)

**Request Flow:**
```
Frontend → Vite Proxy (/fpqe/live → localhost:3000) → Backend (/base/timezone-options)
```

**Response:**
```json
[
  { "airport": "YOW", "airportName": "MACDONALD-CARTIER INTL", "zoneId": "America/Toronto", "utcOffset": "UTC-240", "isBase": true },
  { "airport": "YVR", "airportName": "VANCOUVER INTL, B.C.", "zoneId": "America/Vancouver", "utcOffset": "UTC-420", "isBase": true },
  { "airport": "UTC", "airportName": "Coordinated Universal Time", "zoneId": "UTC", "utcOffset": "UTC+0", "isBase": false }
]
```

**Store:** `gantt/src/stores/timezone-store.ts`
```typescript
interface TimezoneStore {
  timezone: string        // IANA zoneId (e.g. "America/Toronto")
  timezoneAirport: string // Display code (e.g. "YOW")
  timezoneOptions: TzOption[]
  setTimezone: (zoneId: string, airport: string) => void
  setOptions: (options: TzOption[]) => void
}
```

**Persistence:** `timezone` and `timezoneAirport` are saved to `localStorage` under key `gantt-timezone` on every `setTimezone` call, and restored as the store's initial state on page load. This is required for correct `reanchorDateRange` behavior (see below).

## API Service

**File:** `gantt/src/services/timezone-api.ts`

```typescript
export const timezoneApi = {
  async getOptions(): Promise<TzOption[]> {
    return api.get('/base/timezone-options') // Uses axios instance with auth header
  },
}
```

## Authentication Requirements

- **NOT public endpoint** — requires valid JWT token
- Token automatically attached via `api.defaults.headers.common['Authorization']`
- Set on login (`auth-store.ts`) and restored on page refresh
- Backend auth plugin: `live-server/src/plugins/auth.ts`

## Time Conversion

**Utility:** `formatTime(utcTimestamp, zoneId)` in `timezone-store.ts`

```typescript
function formatTime(utcTimestamp: string, zoneId: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zoneId,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(utcTimestamp))
}
```

**Cross-day Indicator:** If arrival crosses midnight local, show `+1` superscript.

## Display Locations

| Component | Shows TZ Badge |
|-----------|----------------|
| Toolbar Button | `🕐 YOW · America/Toronto` |
| Time Axis | `🕐 YOW · UTC-4` |
| Status Bar | `YOW · America/Toronto · UTC-4` |
| Flight Puck | Times converted, no badge |

## Date Range Re-anchoring

When the user switches timezone, the current date range (stored as UTC timestamps) is re-anchored to local midnight in the new timezone so that the displayed calendar days remain consistent with user intent.

**Function:** `reanchorDateRange(oldTz, newTz)` (reads from `filterStore` directly)

**Algorithm:**
1. Convert `start` / `end` to `YYYY-MM-DD` calendar strings in `oldTz` using `Intl.DateTimeFormat`.
2. Re-interpret those calendar date strings as local midnight in `newTz` via `calendarDateToUtcMidnight`.
3. Update the filter store with the new UTC timestamps.

This ensures that if the user was viewing "2026-05-01 to 2026-05-31" in `America/Toronto`, switching to `America/Vancouver` still shows May 1–31 (now anchored to Vancouver midnight) rather than shifting the view by the UTC offset difference.

**Critical invariant:** `oldTz` passed to `reanchorDateRange` MUST be the timezone in which the stored UTC timestamps were originally computed. On page load, `TimezoneSwitcher` calls `reanchorDateRange(currentTz, firstBase.zoneId)` where `currentTz` comes from the store's initial state. If `currentTz` defaulted to `'UTC'` but the stored dates were anchored to a non-UTC timezone, the calendar date read in step 1 could be off by one day — causing the end date to drift +1 day on every refresh. This is why timezone persistence is required: restoring the correct `currentTz` on load makes `reanchorDateRange(savedTz, savedTz)` a no-op when the base timezone hasn't changed.

## Utilities

The following utility functions live in `gantt/src/components/gantt/gantt-utils.ts`:

| Function | Signature | Description |
|----------|-----------|-------------|
| `calendarDateToUtcMidnight` | `(dateStr: string, timezone: string) => string` | Converts a `"YYYY-MM-DD"` calendar date to the UTC ISO timestamp corresponding to local midnight in the given IANA timezone. Used when anchoring the date range after a timezone switch. |
| `getTimezoneOffset` | `(utcTime: string, timezone: string) => number` | Returns the signed UTC offset in minutes at the given UTC instant for the given IANA timezone (positive = east, negative = west). DST-aware because it evaluates the offset at the actual instant, not a fixed rule. |

Both functions are also used by the Ground Task dialog for local↔UTC conversion (see [ground-task.md](ground-task.md)).

## Success Criteria

1. ✅ Dropdown opens/closes correctly
2. ✅ API loads base options with authentication
3. ✅ UTC always available as fallback option (default on load)
4. ✅ Base airports sorted first in dropdown
5. ✅ Selection persists across session (saved to localStorage, restored on page load)
6. ✅ Time axis renders selected timezone header
7. ✅ All timestamps convert to selected timezone