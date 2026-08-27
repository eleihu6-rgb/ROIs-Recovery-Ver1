// gantt/src/components/help/topics/legality/_rule-doc.tsx
//
// Shared renderer + content for the per-rule Legality help topics.
//
// Every rule's facts (function id, name, category, what it does, where it
// originates, and its parameters) live in RULE_DOCS below. Each per-rule topic
// file is a thin wrapper: `export default () => <RuleDoc id="8002/006" />`.
//
// Source of truth for content:
//   • Origin / regulatory wording — "Flair PBS BRD - Rules_FD_v1" (crewrule-dev/)
//     and the cited CAR / CBA sections.
//   • Parameter columns + sample values — the live rule.param_json of workset 433
//     "F8 Full Ruleset" (the same table the Legality tab renders).
//
// Sample values shown here are the BRD regulatory baseline. The live F8 demo
// ruleset may carry adjusted test values — always read the actual numbers in the
// Legality tab's parameter table (see the Legality overview topic).
import type { ReactNode } from 'react'
import { HelpH2, HelpNote } from '../../help-article'

export interface RuleParam {
  /** Column name exactly as it appears in the Legality tab parameter table. */
  name: string
  /** Plain-English meaning of the column. */
  meaning: string
  /** A representative value (regulatory baseline). `*` means "applies to all". */
  sample: string
}

export interface RuleDocData {
  /** Function number, e.g. 8002. */
  fn: number
  /** Instance code, e.g. "006". */
  inst: string
  /** Rule name exactly as shown in the Legality tab. */
  name: string
  /** Taxonomy chip in the Legality tab (Definition / Duty / DO / Rest / …). */
  category: string
  /** True for the four no-violation compute rules (definitions / calculators). */
  computeOnly?: boolean
  /** One-line summary (mirrors the help-data overview). */
  summary: string
  /** What the rule does — 1-3 short paragraphs. */
  usage: ReactNode[]
  /** Where it comes from — regulatory citation + 1-2 paragraphs from the BRD. */
  originCite: string
  origin: ReactNode[]
  /** One row per parameter column. */
  params: RuleParam[]
  /** Optional caveats (e.g. demo-config differences). */
  notes?: ReactNode[]
}

export const RULE_DOCS: Record<string, RuleDocData> = {
  // ── Definitions & calculators (no violations) ──────────────────────────────
  '2014/014': {
    fn: 2014, inst: '014', name: 'Local Night Definition', category: 'Definition', computeOnly: true,
    summary: "Defines the protected overnight window that counts as a “local night's rest” — the building block other day-off and WOCL rules read.",
    usage: [
      "This is a definition, not a check — it never raises a violation on its own. It supplies the local-night window that other rules consume to decide where one “day” of rest ends and the next begins.",
      'Rules that depend on it: 7501 Single Day Free from Duty (a single day free runs from one local night to the next) and the WOCL rules 7503 / 7504 (a run of WOCL duties resets across a local night).',
    ],
    originCite: 'CAR — Flight Crew Member Fatigue Management (Prescriptive Regulations), “Local night’s rest” definition.',
    origin: [
      'The regulation defines a local night’s rest as a rest period of at least nine hours that takes place between 22:30 and 09:30 local time at the location where the flight crew member is acclimatized. Travel time to or from accommodation is excluded.',
    ],
    params: [
      { name: 'Local Night Start', meaning: 'Start of the protected overnight window (acclimatized local time).', sample: '22:30' },
      { name: 'Local Night End', meaning: 'End of the protected overnight window.', sample: '09:30' },
      { name: 'Min Interval Hours', meaning: 'Minimum continuous rest that must fall inside the window for it to count as a local night.', sample: '09:00' },
    ],
    notes: [
      'The live F8 demo ruleset is configured 22:00 / 08:00 / 08:00. The regulatory baseline is 22:30 / 09:30 / 09:00.',
    ],
  },

  '2015/001': {
    fn: 2015, inst: '001', name: 'DO Start Time Definition', category: 'Definition', computeOnly: true,
    summary: 'Defines the local home-base clock used to decide when a duty-ending day starts counting toward Min-GDO rules.',
    usage: [
      'A definition, not a check — it raises no violations. Min-GDO rules 7505 and 7507 use this clock to decide whether a duty that ends shortly after midnight occupies that calendar day.',
      'A duty ending before the configured DO Start Time does not occupy that calendar day for the associated Min-GDO calculation.',
    ],
    originCite: 'ROIs rule definition — DO Start Time for Min-GDO (7505 / 7507).',
    origin: [
      'The rule provides one airline-level local home-base time boundary. The active 7505 / 7507 parameter rows consume that boundary when counting calendar days free from duty.',
    ],
    params: [
      { name: 'DO Start Time', meaning: 'Local home-base clock boundary at which a duty-ending day starts counting for Min-GDO.', sample: '01:00' },
    ],
  },

  '7500/002': {
    fn: 7500, inst: '002', name: 'Basic definition of Acc State', category: 'Definition', computeOnly: true,
    summary: 'Computes each crew member’s acclimatized reference time zone — the “body-clock” location that other rules use to read local time.',
    usage: [
      'A definition, not a check — it raises no violations. Many rules judge times “at the location where the crew member is acclimatized” (WOCL, early/late/night duty, local night). This rule produces that reference time zone per crew per day.',
      'It is consumed by the WOCL rules 7503 / 7504. In the current live port the engine falls back to the crew’s base time zone.',
    ],
    originCite: 'CAR 700.28(5) — Acclimatization; BRD “Acclimatization and Adaption Period”.',
    origin: [
      'An operator may assume a crew member is acclimatized to their home-base time zone unless previous duty would have acclimatized them elsewhere. Crew acclimatize at a rate of one hour per 24 hours spent in a new zone.',
      'A zone difference of less than 4 hours takes 72 hours to acclimatize; a difference of 4 hours or more takes 96 hours.',
    ],
    params: [
      { name: 'TZ Diff', meaning: 'Band of time-zone difference between the new location and the acclimatized one.', sample: '00:00-04:00 · 04:00-24:00' },
      { name: 'Stay Duration', meaning: 'Hours that must be spent in the new zone to become acclimatized, for that difference band.', sample: '72:00-96:00 · 96:00-999:00' },
      { name: 'Stay Duration per X Hours', meaning: 'Daily-adjustment window: the time spent in a new zone per one step of clock shift.', sample: '24:00' },
      { name: 'ACC Time Zone Adjust X Hours', meaning: 'How far the acclimatized clock shifts toward the new zone for each window above.', sample: '01:00' },
    ],
  },

  '7502/002': {
    fn: 7502, inst: '002', name: 'The Calculation of Credit Hours', category: 'Definition', computeOnly: true,
    summary: 'Computes the credit hours earned for each assignment — the value the monthly credit-hour band reconciles against.',
    usage: [
      'A calculator, not a check — it raises no violations. For each assignment it derives a credit-hour value; the monthly credit-hour band in 8002 reads the same definition so the two reconcile.',
      'Credit is the greater of a minimum floor, the flight hours, or a duty-time ratio, depending on the activity type.',
    ],
    originCite: 'CBA — “Credit Hours” definition.',
    origin: [
      'A pilot who reports for work is credited the greater of: a minimum of 4.0 credit hours per worked day (including reserve, vacation, statutory holiday, training, union, administrative and reserve-availability days); scheduled flight hours; actual flight hours flown; or one credit hour for every two hours of duty time, excluding deadhead-only days.',
    ],
    params: [
      { name: 'Assignment Groups', meaning: 'Activity family each row matches.', sample: 'DO|LO|LEA|SBY · FLY · GND' },
      { name: 'Assignments', meaning: 'Specific assignment codes within the group (`*` = all).', sample: '*' },
      { name: 'Minimum CH', meaning: 'Floor credit applied to off / leave / standby days.', sample: '04:00' },
      { name: 'FT Ratio', meaning: 'Flight-time multiplier for flying (credit = block × ratio).', sample: '1.0' },
      { name: 'DP Ratio', meaning: 'Duty-period multiplier for ground duty (credit = duty period × ratio).', sample: '0.5' },
      { name: 'Split Method(SPAN/START)', meaning: 'Which calendar day a multi-day activity’s credit is attributed to.', sample: 'START' },
    ],
  },

  '7272/001': {
    fn: 7272, inst: '001', name: 'Calculate DP of the Reserves', category: 'Definition', computeOnly: true,
    summary: 'Computes the duty-period length to charge for reserve / standby blocks so the cumulative duty-hour rule can count them.',
    usage: [
      'A calculator, not a check — it raises no violations. Reserve and standby blocks carry no flight segments, so this rule assigns them a duty-period value (a fraction of the standby window) that 8002 Maximum Hours of Work then counts.',
    ],
    originCite: 'CAR 700.70 — Flight crew member on Reserve; BRD “Duty Period” / “Flight Crew Member on Reserve/Standby”.',
    origin: [
      'Reserve notice must reach the crew member at least 12 hours before the reserve availability period, or 32 hours before if any part of it falls in their window of circadian low. Flight-deck crew are only assigned to home reserves.',
    ],
    params: [
      { name: 'Assignments', meaning: 'Assignment codes treated as reserve / standby.', sample: 'SBY|PRAM|PRPM' },
      { name: 'Standby Offset', meaning: 'Time trimmed from the start of the standby window before charging.', sample: '00:00' },
      { name: 'Rate', meaning: 'Fraction of the standby window charged as duty period.', sample: '0.33' },
      { name: 'SBY Limit', meaning: 'Optional cap on the charged duty period.', sample: '00:00' },
      { name: 'Notification Limit', meaning: 'Reserve-notice threshold (12h normal / 32h if it overlaps the WOCL).', sample: '00:00' },
    ],
  },

  // ── Cumulative limits ──────────────────────────────────────────────────────
  '8002/006': {
    fn: 8002, inst: '006', name: 'Maximum Flight Time', category: 'Rest',
    summary: 'Caps cumulative block (flight) hours over rolling periods, plus a standalone monthly credit-hour utilisation band.',
    usage: [
      'Sums each crew member’s block hours over rolling windows and flags any window over its limit. A fourth row is a standalone per-calendar-month credit-hour band (min and max).',
    ],
    originCite: 'CAR 700.27(1) and CAR 700.103(1) — Maximum Flight Time.',
    origin: [
      'Flight time must not exceed 112 hours in any 28 consecutive days, 300 hours in any 90 consecutive days, or 1,000 hours in any 365 consecutive days. The BRD adds buffers of 5 / 5 / 10 hours respectively.',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Crew Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'Period', meaning: 'Length of the rolling window.', sample: '28 · 90 · 365' },
      { name: 'Unit', meaning: 'CD = calendar days · CM = calendar month.', sample: 'CD' },
      { name: 'Prorated', meaning: 'Whether the limit is prorated for partial periods.', sample: 'Y' },
      { name: 'Max Limits', meaning: 'Upper cap for the window (HH:MM).', sample: '112:00 · 300:00 · 1000:00' },
      { name: 'Min Limits', meaning: 'Lower bound (used by the credit-hour band).', sample: '00:00 · 65:00' },
      { name: 'Type', meaning: 'BH = block hours · CH = credit hours.', sample: 'BH' },
    ],
    notes: [
      'The live F8 demo ruleset is tuned for Rust-engine testing: 28-day Max shows 40:00, the rolling windows are 28 / 100 / 200 days, and the monthly band is CH 65:00–75:00. The regulatory baseline is 112 / 300 / 1000 hours over 28 / 90 / 365 days.',
    ],
  },

  '8002/009': {
    fn: 8002, inst: '009', name: 'Maximum Hours of Work', category: 'Rest',
    summary: 'Caps cumulative duty hours (hours of work) over rolling periods.',
    usage: [
      'Sums each crew member’s duty time over rolling windows and flags any window over its limit. “Duty time” is synonymous with hours of work and includes positioning.',
    ],
    originCite: 'CAR 700.29(1) — Maximum Number of Hours of Work.',
    origin: [
      'Hours of duty must not exceed 2,200 hours in any 365 consecutive days, 192 hours in any 28 consecutive days, or 60 hours in any 7 consecutive days (when the required single days free from duty are provided — see rule 7501).',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Crew Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'Period', meaning: 'Length of the rolling window.', sample: '7 · 28 · 365' },
      { name: 'Unit', meaning: 'CD = calendar days.', sample: 'CD' },
      { name: 'Prorated', meaning: 'Whether the limit is prorated for partial periods.', sample: 'Y' },
      { name: 'Max Limits', meaning: 'Upper cap for the window (HH:MM).', sample: '60:00 · 192:00 · 2200:00' },
      { name: 'Min Limits', meaning: 'Lower bound.', sample: '00:00' },
      { name: 'Type', meaning: 'DP = duty period (hours of work).', sample: 'DP' },
    ],
  },

  // ── Days off ───────────────────────────────────────────────────────────────
  '7501/004': {
    fn: 7501, inst: '004', name: 'Single Day Free from Duty in Rolling Hours', category: 'Duty',
    summary: 'Guarantees a minimum number of single days free from duty inside rolling-hour windows.',
    usage: [
      'A single day free from duty runs from the start of one local night’s rest to the end of the next (it reads the 2014 Local Night Definition). This rule checks rolling windows: at least 1 single day free in any 168 hours and at least 4 in any 672 hours. Rest and leave days are excluded from work periods.',
    ],
    originCite: 'CAR 700.29(1) — Maximum Number of Hours of Work (time-free-from-duty conditions).',
    origin: [
      'The “60 hours in any 7 consecutive days” duty option requires one single day free from duty entirely within any 168 consecutive hours, and four single days free entirely within any 672 consecutive hours.',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'Period', meaning: 'Length of the rolling window.', sample: '168 · 672' },
      { name: 'Unit', meaning: 'RH = rolling hours.', sample: 'RH' },
      { name: 'Duty Report', meaning: 'For 7508, Y ends rest at the next duty start; N ends rest at the next duty’s first flight departure.', sample: 'Y · N' },
      { name: 'Duty Release', meaning: 'For 7508, Y starts rest after the previous duty end; N starts rest after the previous duty’s last flight arrival.', sample: 'Y · N' },
      { name: 'Duty End Buffer', meaning: 'Buffer added to a duty end to protect the single day (BRD default 30 min).', sample: '00:30' },
      { name: 'Min Limits', meaning: 'Minimum single days free required in that window.', sample: '1 · 4' },
    ],
    notes: [
      'The live F8 demo ruleset raises the 168-hour minimum to 3 for testing; the regulatory baseline is 1.',
    ],
  },

  '7505/002': {
    fn: 7505, inst: '002', name: 'Min # GDOs in a RP', category: 'DO',
    summary: 'Guarantees a minimum number of Guaranteed Days Off in a roster period, sliding with the amount of vacation taken.',
    usage: [
      'Requires 12 GDOs in a 30-day month and 13 in a 31-day month. The required minimum slides down as vacation days in the period increase — a lookup band: pick the row matching the month length and the crew member’s vacation-days range. Once published, unassigned days count as GDOs.',
    ],
    originCite: 'ALPA FLE CBA No. 1, §8.13 — Guaranteed Days Off.',
    origin: [
      'All pilots are scheduled for twelve (12) GDOs in a thirty-day month and thirteen (13) GDOs in a thirty-one-day month, and not more than eighteen (18) days of work in a bid period.',
    ],
    params: [
      { name: 'DO Assignment Group', meaning: 'Assignment family that counts as a day off.', sample: 'DO' },
      { name: 'Min DO', meaning: 'Minimum days off required for this row (slides 13 → 0 as vacation grows).', sample: '13' },
      { name: 'Period / Unit', meaning: 'Window: 1 RP (one roster period).', sample: '1 · RP' },
      { name: 'RP Days Range', meaning: 'Month length the row applies to.', sample: '31-31 · 30-30' },
      { name: 'Count Blank Day', meaning: 'Whether unassigned blank days count as days off.', sample: 'Y' },
      { name: 'Count Layover', meaning: 'Whether layover days count as days off.', sample: 'N' },
      { name: 'Leave Assignments / Leave Days Range', meaning: 'Vacation code and the vacation-days band this row matches.', sample: 'VAC · e.g. 0-0' },
    ],
  },

  '7507/001': {
    fn: 7507, inst: '001', name: 'Min # GDOs in a RP (fly/reserve filters)', category: 'DO',
    summary: 'Same Min-GDO check as 7505, but a band row applies only when the crew’s fly-day and reserve-day counts fall inside the row’s ranges.',
    usage: [
      'After Count Layover, NUM FLY DAY / FLY ASSIGNMENTS and NUM RESERVES / RES ASSIGNMENTS filter which Min DO row matches. Assignment codes are matched on the activity assignment (not assignment group). Empty or * assignment lists disable that filter.',
    ],
    originCite: 'Extension of 7505 Min # GDOs in a RP.',
    origin: [
      'Adds fly-day and reserve-day band filters on top of the 7505 Guaranteed Days Off lookup.',
    ],
    params: [
      { name: 'NUM FLY DAY', meaning: 'Inclusive range of crew-base-local days with a matching fly assignment.', sample: '0-31' },
      { name: 'FLY ASSIGNMENTS', meaning: 'Pipe-separated assignment codes counted as fly days (* = no filter).', sample: 'FLY' },
      { name: 'NUM RESERVES', meaning: 'Inclusive range of reserve days in the period.', sample: '0-31' },
      { name: 'RES ASSIGNMENTS', meaning: 'Pipe-separated reserve assignment codes (* = no filter).', sample: 'RES|CRAM' },
      { name: 'Min DO / Leave / RP Days Range', meaning: 'Same meaning as 7505 once the fly/reserve filters match.', sample: 'see 7505' },
    ],
  },

  '7508/001': {
    fn: 7508, inst: '001', name: 'Single Day Free from Duty in Calendar Days', category: 'Duty',
    summary: 'Guarantees single days free from duty using calendar-day boundaries and configurable duty report/release semantics.',
    usage: [
      'Checks the same 168-hour and 672-hour windows as the rolling-hours variant, but counts a free calendar day using the configured Duty Report and Duty Release boundaries.',
      'A row requires at least 1 free day in 168 hours and at least 4 in 672 hours. Duty End Buffer protects the free-day boundary after a duty ends.',
    ],
    originCite: 'ROIs rule definition — Single Day Free from Duty in Calendar Days.',
    origin: [
      'The calendar-day variant preserves the Min-GDO requirement while making the day boundary explicit: Duty Report controls when rest ends and Duty Release controls when rest starts.',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'Period', meaning: 'Length of the window.', sample: '168 · 672' },
      { name: 'Unit', meaning: 'RH = rolling hours.', sample: 'RH' },
      { name: 'Duty Report', meaning: 'Whether rest ends at the next duty start (Y) or first flight departure (N).', sample: 'Y' },
      { name: 'Duty Release', meaning: 'Whether rest starts after the previous duty end (Y) or last flight arrival (N).', sample: 'Y' },
      { name: 'Duty End Buffer', meaning: 'Buffer added after duty end before the free-day boundary is counted.', sample: '00:00' },
      { name: 'Min Limits', meaning: 'Minimum calendar days free required in that window.', sample: '1 · 4' },
    ],
  },

  // ── Window of Circadian Low (WOCL) ─────────────────────────────────────────
  '7503/003': {
    fn: 7503, inst: '003', name: 'Limits of Consecutive WOCLs', category: 'Duty',
    summary: 'Caps how many consecutive duties may touch the Window of Circadian Low (02:00–05:59).',
    usage: [
      'A duty is a “WOCL duty” if any part of it overlaps 02:00–05:59 in the crew member’s acclimatized time (it reads rule 7500). The consecutive run resets across a local night (it reads rule 2014). This rule caps the number of consecutive WOCL duties.',
    ],
    originCite: 'CAR 700.51(1) — Consecutive Night Duty Periods; CAR 700.50(3) — Use Limited to Three Consecutive Nights.',
    origin: [
      'An operator must not assign more than three consecutive flight duty periods that fall any part between 02:00 and 05:59 (acclimatized time) unless one local night’s rest is provided at the end of the third. The number of consecutive days is configurable.',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'WOCL Start', meaning: 'Start of the circadian-low window.', sample: '02:00' },
      { name: 'WOCL End', meaning: 'End of the circadian-low window.', sample: '05:59' },
      { name: 'Max Consecutive WOCLs', meaning: 'Maximum consecutive WOCL duties allowed.', sample: '3' },
    ],
    notes: [
      'The live F8 demo ruleset lowers Max Consecutive WOCLs to 2 for testing; the regulatory baseline is 3.',
    ],
  },

  '7504/003': {
    fn: 7504, inst: '003', name: 'Spacing Rule - WOCL', category: 'Duty',
    summary: 'Enforces a minimum spacing between two WOCL flight duties.',
    usage: [
      'Uses the same pairwise-spacing engine as 8056 Roster Spacing, restricted to flight duty → flight duty where both duties touch the WOCL. Spacing between two WOCLs should be no less than 55 hours; any duties may be assigned within that gap.',
    ],
    originCite: 'CAR 700.51 — Limits on Infringing the Window of Circadian Low.',
    origin: [
      'The BRD states: “Spacing between two WOCLs should be no less than 55 hours (just spacing, any duties can be assigned in this time period).”',
    ],
    params: [
      { name: 'Prev / Next Assignment Groups', meaning: 'Activity family on each side of the gap.', sample: 'FLY → FLY' },
      { name: 'Prev / Next Attributes', meaning: 'Tag both duties must carry for the rule to apply.', sample: 'WOCL → WOCL' },
      { name: 'Utilize Post Rest', meaning: 'Measure the gap from the end of post-duty rest.', sample: 'Y' },
      { name: 'Level', meaning: 'Granularity of the activities compared.', sample: 'D (duty)' },
      { name: 'Min Period', meaning: 'Minimum spacing required between the two WOCL duties.', sample: '55' },
      { name: 'Unit', meaning: 'RH = rolling hours.', sample: 'RH' },
    ],
    notes: [
      'The live F8 demo ruleset sets Min Period to 80 RH for testing; the regulatory baseline is 55.',
    ],
  },

  // ── Roster structure ───────────────────────────────────────────────────────
  '7506/002': {
    fn: 7506, inst: '002', name: 'One Checkin Per Day.', category: 'Roster',
    summary: 'A crew member may report for a flight duty at most once per calendar day.',
    usage: [
      'Flags a second check-in (report) on the same calendar day. Two reports are legal only when they fall on different calendar days.',
    ],
    originCite: 'BRD — “Single Daily Check-in Limitation”.',
    origin: [
      'Flight crew members shall not be scheduled or required to report for a flight duty period more than once per calendar day.',
    ],
    params: [
      { name: 'Bases / Ranks / Fleets / Teams', meaning: 'Applicability scope (`*` = all crew).', sample: '*' },
      { name: 'Assignments', meaning: 'Assignment codes that count as a check-in / report.', sample: 'FLY' },
    ],
  },

  '1001/001': {
    fn: 1001, inst: '001', name: 'Assignment Overlap', category: 'Roster',
    summary: 'Flags when two of a crew’s assignments overlap in time — the “before” duty and the “after” duty both demand the crew at once.',
    usage: [
      'Flags when two of a crew’s assignments overlap in time — the “before” duty and the “after” duty both demand the crew at once. It is a Table rule: each parameter row defines a prohibited Before → After assignment combination.',
      'Assignment Rest Before picks the window the After duty is tested against — Y = duty end, N = rest end. The default FLY / SBY-before rows with Rest Before = Y prohibit an After duty of type L|O or a DO (day off); a rest-only day off or leave that does not overlap the duty stays Allowed.',
      'FLY / DHD → After pairs also respect Definition rule 2015 when the After task matches 2015 Assignments or Assignment Groups: when Duty Release at home base is strictly before the configured Start Time (e.g. 00:59 before 01:00), the pair is treated as non-overlapping even if rest extends into the After day.',
    ],
    originCite: 'Model A system template (reference “ROIs”); enabled in the F8 Full Ruleset (workset 433).',
    origin: [
      'The rule comes from the Model A rule template set — its reference is “ROIs”. It is seeded into the F8 Full Ruleset (workset 433) alongside the other roster-structure checks.',
    ],
    params: [
      { name: 'Assignment Group Before', meaning: 'Assignment family of the earlier (Before) duty.', sample: 'FLY · SBY' },
      { name: 'Assignment Before', meaning: 'Specific Before assignment code — * applies to all.', sample: '*' },
      { name: 'Assignment Rest Before', meaning: 'Window the After duty is tested against: Y = duty end, N = rest end.', sample: 'Y' },
      { name: 'Assignment Type Before', meaning: 'Type of the Before duty — * applies to all.', sample: '*' },
      { name: 'Assignment Group After', meaning: 'Assignment family of the later (After) duty.', sample: '* · DO' },
      { name: 'Assignment After', meaning: 'Specific After assignment code — * applies to all.', sample: '*' },
      { name: 'Assignment Type After', meaning: 'Type of the After duty that is prohibited when it overlaps.', sample: 'L|O · *' },
    ],
  },

  // ── Qualification ──────────────────────────────────────────────────────────
  '8004/004': {
    fn: 8004, inst: '004', name: 'Basic Competency-F8', category: 'Basic',
    summary: 'Checks each crew member is qualified for the base, rank and fleet of every flight assignment.',
    usage: [
      'For each flight assignment, validates that the crew member holds the required competency. The check can be enabled per dimension (BASE / RANK / FLEET); by default only the BASE check is on.',
    ],
    originCite: 'BRD — Qualification Rules (Basic Base / Rank / Fleet competency).',
    origin: [
      'A crew member must hold the qualification for the base, rank and fleet they are assigned to operate.',
    ],
    params: [
      { name: 'Base / Rank / Fleet', meaning: 'Applicability scope (`*` = all).', sample: '*' },
      { name: 'Type', meaning: 'Which dimension this row checks.', sample: 'BASE · RANK · FLEET' },
      { name: 'Enable Check', meaning: 'Whether this dimension is enforced (BASE on, RANK / FLEET off).', sample: 'Y / N' },
      { name: 'Grace Period', meaning: 'Days of grace before an expired qualification fails.', sample: '0' },
      { name: 'Unit', meaning: 'CD = calendar days.', sample: 'CD' },
      { name: 'Assignments', meaning: 'Assignment codes the check applies to.', sample: 'FLY' },
    ],
  },

  '8030/004': {
    fn: 8030, inst: '004', name: 'Age Restriction', category: 'Qual',
    summary: 'Limits how many crew over an age threshold may be on the same flight.',
    usage: [
      'An aggregate-per-flight rule: it counts the crew in a flight’s complement who are over the age threshold and flags the flight if the count exceeds the maximum.',
    ],
    originCite: 'BRD — “Age Restriction”.',
    origin: [
      'A pilot over 65 years old may only fly within Canada, and a pilot over 65 may not fly together with a pilot over 60. Crew birthdays are maintained in the crew profile.',
    ],
    params: [
      { name: 'Division', meaning: 'Crew division the rule applies to (P = pilots).', sample: 'P' },
      { name: 'Airport', meaning: 'Airport scope (`*` = all).', sample: '*' },
      { name: 'Age Define', meaning: 'Age threshold a crew member is counted against.', sample: '65' },
      { name: 'Max Number', meaning: 'Maximum crew over the threshold allowed on one flight.', sample: '1' },
    ],
    notes: [
      'Enforced on the pairing complement (all crews on the trip together), including pre-assigned and concurrently assigned crew — not only the crew being edited.',
      'The live F8 demo ruleset may lower Age Define for testing; the regulatory baseline is 65.',
    ],
  },

  '8056/006': {
    fn: 8056, inst: '006', name: 'Roster Spacing', category: 'Rest',
    summary: 'A general minimum-spacing rule between two activities matching configured attributes; 7504 is its WOCL specialization.',
    usage: [
      'A pairwise-spacing engine. It flags when two matching duties are scheduled closer than the configured gap — here a flight duty (A) followed by a flight, standby or simulator duty (B).',
    ],
    originCite: 'CAR — Rest Period; BRD “Rest Periods”.',
    origin: [
      'Following a flight duty period an operator must provide a rest period (13 hours when it ends at home base). Roster Spacing enforces the minimum gap between qualifying activities; the WOCL spacing rule 7504 is a specialization of this engine.',
    ],
    params: [
      { name: 'Assignment Group A / B', meaning: 'Activity family on each side of the gap.', sample: 'FLY → FLY|SBY|SIM' },
      { name: 'Attribute / Label A / B', meaning: 'Extra tags each side must match (`*` = any).', sample: '*' },
      { name: 'Space', meaning: 'Minimum spacing required between A and B.', sample: '13' },
      { name: 'Unit', meaning: 'RH = rolling hours.', sample: 'RH' },
      { name: 'Directional', meaning: 'Whether order matters (A before B).', sample: 'Y' },
      { name: 'Utilize Post Duty Rest', meaning: 'Measure the gap from the end of post-duty rest.', sample: 'Y' },
    ],
    notes: [
      'The live F8 demo ruleset sets Space to 24 RH for testing; the regulatory baseline rest after a home-base duty is 13 hours.',
    ],
  },
}

// ── Renderer ──────────────────────────────────────────────────────────────────

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="text-2xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{children}</span>
)

export const RuleDoc = ({ id }: { id: string }) => {
  const d = RULE_DOCS[id]
  if (!d) return null
  return (
    <div>
      {/* Facts line */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Chip>Function {d.fn}</Chip>
        <Chip>Category: {d.category}</Chip>
        {d.computeOnly && <Chip>No violations</Chip>}
      </div>

      {d.computeOnly && (
        <HelpNote>
          This rule is a {d.category.toLowerCase()} — it computes a value other rules read and never
          raises a violation by itself.
        </HelpNote>
      )}

      <HelpH2>What it does</HelpH2>
      {d.usage.map((p, i) => (
        <p key={i} className="text-xs text-foreground leading-relaxed mb-3">{p}</p>
      ))}

      <HelpH2>Where it comes from</HelpH2>
      <p className="text-2xs text-muted-foreground mb-2">{d.originCite}</p>
      {d.origin.map((p, i) => (
        <p key={i} className="text-xs text-foreground leading-relaxed mb-3">{p}</p>
      ))}

      <HelpH2>Parameters</HelpH2>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 text-left font-semibold text-foreground w-1/3">Parameter</th>
            <th className="py-1.5 pr-3 text-left font-semibold text-foreground">Meaning</th>
            <th className="py-1.5 text-left font-semibold text-foreground">Sample</th>
          </tr>
        </thead>
        <tbody>
          {d.params.map((p) => (
            <tr key={p.name} className="border-b border-border/50 last:border-0 align-top">
              <td className="py-2 pr-3 font-medium text-foreground">{p.name}</td>
              <td className="py-2 pr-3 text-muted-foreground">{p.meaning}</td>
              <td className="py-2 font-mono tabular-nums text-foreground whitespace-nowrap">{p.sample}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.notes?.map((n, i) => <HelpNote key={i}>{n}</HelpNote>)}
    </div>
  )
}
