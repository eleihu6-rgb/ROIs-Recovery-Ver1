// NPBS-Legend bids report parser.
//
// Pure functions that turn a CLASS-BidsReport_*.txt export into structured,
// tiered, portal-mapped crew bid descriptors. No Playwright / DOM here -- this is
// independently unit-tested via `node --test`.
//
// Report grammar (see docs/superpowers/specs/2026-06-20-npbs-bids-to-portal-...md):
//   76-dash long rulers delimit alternating header / body segments;
//   a header has "Seniority / Category / Employee #" + "Default Bid"|"Current Bid";
//   a body has "Bid Preferences:" then numbered preference lines (priority order).

import { isNoiseLine, mapPredicate } from './mapping.mjs';

const LONG_RULER = /^-{60,}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Rule #5: shift every source-month (March 2026) date to the target month/year,
// day-of-month preserved. Default target is June 2026 (the original behaviour);
// the fixture generator overrides it from the requested bidding period so the
// date predicates (Prefer Off, etc.) land in the requested range.
export const shiftDates = (text, target = { month: 6, year: 2026 }) => {
  const m = String(target.month).padStart(2, '0');
  const abbr = MONTHS[target.month - 1];
  const full = MONTH_NAMES[target.month - 1];
  const y = target.year;
  return text
    .replace(/\bMar(?:ch)? (\d{1,2}), 2026\b/g, `${abbr} $1, ${y}`)
    .replace(/\b2026-03-(\d{2})\b/g, `${y}-${m}-$1`)
    .replace(/Period:\s*March 2026/gi, `Period: ${full} ${y}`);
};

// Split the report into header/body records.
export const splitRecords = (text) => {
  const lines = text.split(/\r?\n/);
  // Group lines into segments separated by long rulers.
  const segments = [];
  let cur = [];
  for (const line of lines) {
    if (LONG_RULER.test(line.trim())) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) segments.push(cur);

  const records = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const headerText = seg.join('\n');
    const empMatch = headerText.match(/Employee #\s+(\d+)/);
    if (!empMatch) continue; // not a header segment
    const catMatch = headerText.match(/Category\s+(\S+)/);
    const senMatch = headerText.match(/Seniority\s+(\d+)/);
    const context = /Current Bid/.test(headerText) ? 'Current' : 'Default';
    const category = catMatch ? catMatch[1] : '';
    const [base = '', fleet = '', rank = ''] = category.split('-');
    // The body is the next segment (contains "Bid Preferences:").
    const body = segments[i + 1] && segments[i + 1].join('\n').includes('Bid Preferences') ? segments[i + 1] : [];
    records.push({
      employeeId: empMatch[1],
      seniority: senMatch ? Number(senMatch[1]) : null,
      category,
      base,
      fleet,
      rank,
      context,
      lines: body,
    });
  }
  return records;
};

// Rule #2: Current beats Default. Keyed by employeeId.
export const selectContext = (records) => {
  const byCrew = new Map();
  for (const rec of records) {
    const existing = byCrew.get(rec.employeeId);
    if (!existing || (rec.context === 'Current' && existing.context !== 'Current')) {
      byCrew.set(rec.employeeId, rec);
    }
  }
  return byCrew;
};

// Rule #3: extract the ordered numbered predicate lines of the PRIMARY bid group.
// Only the first group carries numbered lines in the NPBS export.
export const primaryGroupPredicates = (bodyLines) => {
  const preds = [];
  let inPrefs = false;
  for (const raw of bodyLines) {
    if (/Bid Preferences:/i.test(raw)) {
      inPrefs = true;
      continue;
    }
    if (!inPrefs) continue;
    const m = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (m) preds.push(m[1].trim());
  }
  return preds;
};

// Build tiered, mapped crew bids for one record (Rule #1 + #4).
export const buildCrewBids = (record) => {
  const predicates = primaryGroupPredicates(record.lines).filter((p) => !isNoiseLine(p));
  const properties = [];
  const dropped = [];
  let tierIndex = 0;
  for (const predicate of predicates) {
    tierIndex += 1; // priority position among real predicates
    if (tierIndex > 7) {
      dropped.push({ predicate, reason: 'beyond-tier-7' });
      continue;
    }
    const mapped = mapPredicate(predicate);
    if (mapped.skipped) {
      dropped.push({ predicate, reason: mapped.reason });
      continue;
    }
    const { droppedClauses = [], ...desc } = mapped;
    properties.push({ tier: `T${tierIndex}`, predicate, ...desc });
    for (const c of droppedClauses) dropped.push({ predicate, reason: `secondary-clause-dropped: ${c}` });
  }
  return {
    employeeId: record.employeeId,
    category: record.category,
    base: record.base,
    fleet: record.fleet,
    rank: record.rank,
    seniority: record.seniority,
    context: record.context,
    properties,
    dropped,
  };
};

// Rule #6: select N crew per (base x rank) bucket, each with >= minProps mapped props.
// Greedy by seniority (lowest number = most senior first) within each bucket.
export const selectCrew = (records, config) => {
  const { buckets, perBucket = 6, minProps = 4 } = config;
  const effective = [...selectContext(records).values()];
  const built = effective
    .map(buildCrewBids)
    .filter((c) => c.properties.length >= minProps)
    .sort((a, b) => (a.seniority ?? 1e9) - (b.seniority ?? 1e9));

  const selected = [];
  const counts = Object.fromEntries(buckets.map((b) => [b, 0]));
  for (const crew of built) {
    const key = `${crew.base}-${crew.rank}`;
    if (!(key in counts)) continue;
    if (counts[key] >= perBucket) continue;
    counts[key] += 1;
    selected.push(crew);
  }
  return { selected, counts };
};
