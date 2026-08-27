// Generate the committed Playwright fixture + unmapped report from an NPBS export.
//
//   node e2e/utils/npbs/generate-fixture.mjs [inputTxt] [fixtureOut] [reportOut] [flags]
//
// Flags (used by R'Bot's create_crew_bids run; all optional):
//   --bases YVR,YYZ          restrict to these crew bases
//   --ranks CA,FO            restrict to these crew ranks (base AND rank => base×rank buckets)
//   --period-start 2026-07-01  bidding period start (drives date shift + period label)
//   --period-end   2026-07-31  bidding period end (currently informational)
//   --per-bucket 6           crew per base×rank bucket (default 6)
//   --employee-ids 73,113    select these exact employees in the given order
//   --no-shift               preserve every source date verbatim
//   --run-id <id>            bind fixture, Playwright results, and report
//
// With no flags the defaults target the June-2026 simulation (unchanged behaviour).
// The committed fixture is deterministic and reviewable; never hand-edit it.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { shiftDates, splitRecords, selectCrew, buildCrewBids, selectContext } from './parse-npbs-bids.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// ── Parse argv: --flag value pairs + leftover positionals ──────────────────
const flags = {};
const positionals = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (a === '--no-shift') {
      flags['no-shift'] = true;
      continue;
    }
    flags[a.slice(2)] = argv[i + 1] ?? '';
    i++;
  } else {
    positionals.push(a);
  }
}
const csv = (v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : []);

const inputTxt = positionals[0] ?? path.join(repoRoot, 'docs/test-cases/CLASS-BidsReport_March2026.txt');
const fixtureOut = positionals[1] ?? path.join(repoRoot, 'e2e/fixtures/pbs/npbs-bids-jun2026.json');
const reportOut = positionals[2] ?? path.join(repoRoot, 'e2e/results/npbs-issues/unmapped-report.json');

const reqBases = csv(flags.bases);
const reqRanks = csv(flags.ranks);
const reqEmployeeIds = csv(flags['employee-ids']);
const perBucket = flags['per-bucket'] ? Number(flags['per-bucket']) : 6;
const noShift = flags['no-shift'] === true;
const runId = String(flags['run-id'] || `npbs-${Date.now()}`);

// Bidding period: default June 2026 (preserves original behaviour). When a start
// is given, shift the March source dates to that month/year and label accordingly.
const periodStart = flags['period-start'] || '2026-06-01';
const periodEnd = flags['period-end'] || '2026-06-30';
const startMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodStart);
if (!startMatch) {
  console.error(`Invalid --period-start "${periodStart}" (expected YYYY-MM-DD)`);
  process.exit(2);
}
const periodYear = Number(startMatch[1]);
const periodMonth = Number(startMatch[2]);

// Buckets: base AND rank => cross product (the R'Bot scope rule). When unset, fall
// back to the original mixed default so the committed fixture stays reproducible.
const DEFAULT_BUCKETS = ['YVR-CA', 'YVR-FO', 'YYZ-CA', 'YYZ-FO'];
const BUCKETS =
  reqBases.length && reqRanks.length
    ? reqBases.flatMap((b) => reqRanks.map((r) => `${b}-${r}`))
    : DEFAULT_BUCKETS;

const raw = fs.readFileSync(inputTxt, 'utf-8');
const sourceSha256 = createHash('sha256').update(raw).digest('hex');
const text = noShift ? raw : shiftDates(raw, { month: periodMonth, year: periodYear }); // rule #5
const records = splitRecords(text);
const allEffective = [...selectContext(records).values()].map(buildCrewBids);

let selected;
let counts;
if (reqEmployeeIds.length) {
  const byEmployeeId = new Map(allEffective.map((crew) => [crew.employeeId, crew]));
  const missing = reqEmployeeIds.filter((employeeId) => !byEmployeeId.has(employeeId));
  if (missing.length) {
    console.error(`Employees not found in ${path.basename(inputTxt)}: ${missing.join(', ')}`);
    process.exit(3);
  }
  selected = reqEmployeeIds.map((employeeId) => byEmployeeId.get(employeeId));
  counts = Object.fromEntries(selected.map((crew) => [`${crew.base}-${crew.rank}`, 0]));
  for (const crew of selected) {
    const key = `${crew.base}-${crew.rank}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
} else {
  ({ selected, counts } = selectCrew(records, { buckets: BUCKETS, perBucket, minProps: 4 }));
}

if (!selected.length) {
  console.error(`No crew matched scope ${BUCKETS.join(', ')} in ${path.basename(inputTxt)}`);
  process.exit(3);
}

const fixture = {
  period: `${periodYear}${String(periodMonth).padStart(2, '0')}`,
  periodStart,
  periodEnd,
  source: path.basename(inputTxt),
  sourceSha256,
  dateMode: noShift ? 'no-shift' : 'shifted',
  runId,
  buckets: Object.keys(counts),
  generatedFrom: 'e2e/utils/npbs/generate-fixture.mjs',
  crew: selected.map((c) => ({
    employeeId: c.employeeId,
    category: c.category,
    base: c.base,
    rank: c.rank,
    seniority: c.seniority,
    context: c.context,
    properties: c.properties,
  })),
};

// Unmapped report: per-crew dropped predicates for ALL effective crew (not just
// selected), so we can see total coverage and what to extend next.
const droppedReasonCounts = {};
for (const c of allEffective) {
  for (const d of c.dropped) {
    const key = d.reason.replace(/:.*$/, '');
    droppedReasonCounts[key] = (droppedReasonCounts[key] ?? 0) + 1;
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  runId,
  source: path.basename(inputTxt),
  sourceSha256,
  period: fixture.period,
  dateMode: fixture.dateMode,
  totalRecords: records.length,
  effectiveCrew: allEffective.length,
  mappedProperties: allEffective.reduce((sum, crew) => sum + crew.properties.length, 0),
  droppedProperties: allEffective.reduce((sum, crew) => sum + crew.dropped.length, 0),
  selectedCrew: selected.length,
  bucketCounts: counts,
  droppedReasonCounts,
  selectedCrewDropped: selected.map((c) => ({ employeeId: c.employeeId, category: c.category, dropped: c.dropped })),
};

fs.mkdirSync(path.dirname(fixtureOut), { recursive: true });
fs.mkdirSync(path.dirname(reportOut), { recursive: true });
fs.writeFileSync(fixtureOut, JSON.stringify(fixture, null, 2) + '\n');
fs.writeFileSync(reportOut, JSON.stringify(report, null, 2) + '\n');

console.log(`Fixture: ${path.relative(repoRoot, fixtureOut)}  (${selected.length} crew, period ${fixture.period})`);
console.log(`Run:     ${runId}  (${fixture.dateMode}, sha256 ${sourceSha256})`);
console.log(`Bucket counts:`, counts);
console.log(`Report:  ${path.relative(repoRoot, reportOut)}`);
console.log(`Dropped reason counts:`, droppedReasonCounts);
