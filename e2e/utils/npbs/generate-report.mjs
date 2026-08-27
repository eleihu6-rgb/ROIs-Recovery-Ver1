// Generate a MS Word (.docx) summary of the NPBS bids simulation from the latest
// per-crew issue files + the fixture. Dependency-free: builds OOXML parts and zips
// them with the system `zip` (no new npm/pip packages — honours the dep-security rules).
//
//   node e2e/utils/npbs/generate-report.mjs [outPath]

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

// ── argv: optional positional outPath + --fixture/--issues-dir <path> ────────
// --fixture lets a scoped run (e.g. a single base) report only its own crew even
// when concurrent runs share e2e/results/npbs-issues. When given, crew
// aggregation is restricted to that fixture's employee IDs.
const argv = process.argv.slice(2)
const flags = {}
const positionals = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) { flags[a.slice(2)] = argv[i + 1] ?? ''; i++ }
  else positionals.push(a)
}
const fixturePath = flags.fixture
  ? path.resolve(flags.fixture)
  : path.join(repoRoot, 'e2e/fixtures/pbs/npbs-bids-jun2026.json')
const issuesDir = flags['issues-dir']
  ? path.resolve(flags['issues-dir'])
  : path.join(repoRoot, 'e2e/results/npbs-issues')

// Timestamp the default report name (local time) → NPBS-Bids-Simulation-Report-YYYY-MM-DD-HHMM.docx
const now = new Date()
const p2 = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`
const defaultOut = path.join(repoRoot, `docs/test-cases/pbs/NPBS-Bids-Simulation-Report-${stamp}.docx`)
const outPath = positionals[0] ? path.resolve(positionals[0]) : defaultOut

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'))
const strictRunMetadata = Boolean(fixture.runId && fixture.sourceSha256)
// Scope to the fixture's crew so concurrent runs writing into the shared issues
// dir (and stale leftovers from prior runs) don't bleed into this report.
const fixtureIds = new Set(fixture.crew.map((c) => String(c.employeeId)))
const crewFiles = fs
  .readdirSync(issuesDir)
  .filter((f) => f.endsWith('.json') && f !== 'unmapped-report.json')
  .map((f) => JSON.parse(fs.readFileSync(path.join(issuesDir, f), 'utf-8')))
  .filter((d) => {
    if (!fixtureIds.has(String(d.employeeId))) return false
    if (!strictRunMetadata) return true
    return d.runId === fixture.runId && d.sourceSha256 === fixture.sourceSha256
  })
  .sort((a, b) => Number(a.employeeId) - Number(b.employeeId))

const resultIds = new Set(crewFiles.map((crew) => String(crew.employeeId)))
const missingCrew = [...fixtureIds].filter((employeeId) => !resultIds.has(employeeId))
if (missingCrew.length) {
  throw new Error(`Missing current run results for employee(s): ${missingCrew.join(', ')}`)
}

// ---- aggregate ----
let placedTotal = 0
let propTotal = 0
let full = 0
let partial = 0
let zero = 0
let durationTotalMs = 0
const reasonCounts = {}
const placedByCode = {}
const failedByCode = {}
const failures = [] // {crew, testId, tier, code, name, reason, image}

const PROP_NAME = {}
for (const c of fixture.crew) for (const p of c.properties) PROP_NAME[p.propertyCode] = p.name

for (const d of crewFiles) {
  durationTotalMs += Number(d.durationMs ?? 0)
  if (typeof d.placed !== 'number') { zero += 1; continue }
  placedTotal += d.placed
  propTotal += d.totalProperties
  if (d.placed === d.totalProperties) full += 1
  else if (d.placed > 0) partial += 1
  else zero += 1
  for (const p of d.placedDetail ?? []) placedByCode[p.code] = (placedByCode[p.code] ?? 0) + 1
  for (const i of d.issues ?? []) {
    const key = String(i.reason || '').split(':')[0].split('(')[0].trim()
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1
    failedByCode[i.code] = (failedByCode[i.code] ?? 0) + 1
    failures.push({ crew: d.employeeId, testId: `PBS-33${'' + (fixture.crew.findIndex((c) => c.employeeId === d.employeeId) + 1)}`.replace('33', '33').slice(0, 7), tier: i.tier, code: i.code, name: i.name, reason: i.reason, image: i.image })
  }
}
const pct = propTotal ? Math.round((100 * placedTotal) / propTotal) : 0

// ---- OOXML builders ----
const esc = (s) =>
  String(s ?? '')
    .replace(/\x1b\[[0-9;]*m/g, '') // strip ANSI colour codes from Playwright errors
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // drop control chars invalid in XML 1.0
    .replace(/[\r\n]+/g, ' ') // collapse newlines so cells stay single-line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
const run = (text, { bold, color, size } = {}) =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
const para = (text, opts = {}) => {
  const { heading, bold, color, size, spacingAfter = 80 } = opts
  const styleSz = heading === 1 ? 32 : heading === 2 ? 26 : size
  const pPr = `<w:pPr><w:spacing w:after="${spacingAfter}"/>${heading ? '<w:outlineLvl w:val="' + (heading - 1) + '"/>' : ''}</w:pPr>`
  return `<w:p>${pPr}${run(text, { bold: bold ?? Boolean(heading), color, size: styleSz })}</w:p>`
}
const cell = (text, { bold, color, w = 1500 } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p>${run(text, { bold, color, size: 18 })}</w:p></w:tc>`
const rowOf = (cells) => `<w:tr>${cells.join('')}</w:tr>`
const tableOf = (rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
    .join('') +
  `</w:tblBorders></w:tblPr>${rows.join('')}</w:tbl>`

const body = []
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const periodLabel = /^\d{6}$/.test(String(fixture.period ?? ''))
  ? `${MONTHS[Number(String(fixture.period).slice(4))] ?? ''} ${String(fixture.period).slice(0, 4)}`.trim()
  : 'June 2026'
const fixtureRel = path.relative(repoRoot, fixturePath)
body.push(para('NPBS-Legend Crew Bids — Portal Simulation Test Report', { heading: 1 }))
body.push(para(`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`))
body.push(para(`Target period: ${periodLabel} (source export: ${esc(fixture.source)})`))
body.push(para(`Run ID: ${fixture.runId ?? 'legacy fixture (not recorded)'}`))
body.push(para(`Source SHA-256: ${fixture.sourceSha256 ?? 'legacy fixture (not recorded)'}`))
body.push(para(`Date handling: ${fixture.dateMode === 'no-shift' ? 'source dates preserved verbatim (no shift)' : 'source dates shifted to target period'}`))
body.push(para(`Fixture: ${fixtureRel} · Spec: e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts (PBS-33xx)`))

body.push(para('1. What this test does', { heading: 2 }))
body.push(
  para(
    'Each crew is logged into the pbs-portal by their Employee #, and their legacy NPBS-Legend bids ' +
      `(mapped to portal properties, tiered T1–T7, ${fixture.dateMode === 'no-shift' ? 'with source dates preserved verbatim' : 'with dates shifted to the target period'}) are placed through the real bid UI ` +
      '(open property dialog → set action/value → select tier → ADD BID). Every placed bid is verified present ' +
      'in the EXISTING list. Unplaceable bids and UI blockers are recorded (project rule #7: no product code is ' +
      'changed to fit); each failure is captured as a screenshot under image/pbs.',
  ),
)

body.push(para('2. Summary', { heading: 2 }))
body.push(
  tableOf([
    rowOf([cell('Metric', { bold: true, w: 4000 }), cell('Value', { bold: true, w: 3000 })]),
    rowOf([cell('Crew tested', { w: 4000 }), cell(String(crewFiles.length), { w: 3000 })]),
    rowOf([cell('Buckets (base × rank)', { w: 4000 }), cell(fixture.buckets.join(', '), { w: 3000 })]),
    rowOf([cell('Crew: all bids placed', { w: 4000 }), cell(String(full), { w: 3000 })]),
    rowOf([cell('Crew: some bids placed', { w: 4000 }), cell(String(partial), { w: 3000 })]),
    rowOf([cell('Crew: no bids placed', { w: 4000 }), cell(String(zero), { color: zero ? 'C00000' : undefined, w: 3000 })]),
    rowOf([cell('Bids placed / total', { w: 4000 }), cell(`${placedTotal} / ${propTotal}  (${pct}%)`, { w: 3000 })]),
    rowOf([cell('Blockers recorded', { w: 4000 }), cell(String(failures.length), { w: 3000 })]),
    rowOf([cell('Crew execution time total', { w: 4000 }), cell(`${durationTotalMs} ms`, { w: 3000 })]),
  ]),
)

body.push(para('3. Per-crew results', { heading: 2 }))
body.push(
  tableOf([
    rowOf([
      cell('Crew #', { bold: true, w: 1100 }),
      cell('Category', { bold: true, w: 2200 }),
      cell('Context', { bold: true, w: 1300 }),
      cell('Placed/Total', { bold: true, w: 1600 }),
      cell('Duration', { bold: true, w: 1400 }),
      cell('Status', { bold: true, w: 1400 }),
    ]),
    ...crewFiles.map((d) => {
      const p = d.placed ?? 0
      const t = d.totalProperties ?? 0
      const status = typeof d.placed !== 'number' ? 'LOGIN FAIL' : p === t ? 'FULL' : p > 0 ? 'PARTIAL' : 'NONE'
      const color = status === 'FULL' ? '107C10' : status === 'PARTIAL' ? '9C6500' : 'C00000'
      return rowOf([
        cell(`#${d.employeeId}`, { w: 1100 }),
        cell(d.category ?? '', { w: 2200 }),
        cell(d.context ?? '', { w: 1300 }),
        cell(`${p}/${t}`, { w: 1600 }),
        cell(`${Number(d.durationMs ?? 0)} ms`, { w: 1400 }),
        cell(status, { color, w: 1400 }),
      ])
    }),
  ]),
)

body.push(para('Execution timing by crew:', { bold: true, spacingAfter: 40 }))
body.push(
  tableOf([
    rowOf([cell('Crew', { bold: true, w: 1200 }), cell('Total', { bold: true, w: 1600 }), cell('Stages', { bold: true, w: 6500 })]),
    ...crewFiles.map((d) => {
      const stages = Object.entries(d.stageDurationsMs ?? {})
        .map(([name, duration]) => `${name}=${duration}ms`)
        .join(', ')
      return rowOf([
        cell(`#${d.employeeId}`, { w: 1200 }),
        cell(`${Number(d.durationMs ?? 0)} ms`, { w: 1600 }),
        cell(stages || '(not recorded)', { w: 6500 }),
      ])
    }),
  ]),
)

body.push(para('4. Blocker breakdown', { heading: 2 }))
body.push(
  tableOf([
    rowOf([cell('Reason', { bold: true, w: 4500 }), cell('Count', { bold: true, w: 1500 })]),
    ...Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => rowOf([cell(r, { w: 4500 }), cell(String(n), { w: 1500 })])),
  ]),
)
body.push(para('Placement by portal property code (placed vs failed):', { bold: true, spacingAfter: 40 }))
const codes = [...new Set([...Object.keys(placedByCode), ...Object.keys(failedByCode)])].sort((a, b) => Number(a) - Number(b))
body.push(
  tableOf([
    rowOf([cell('Code', { bold: true, w: 1100 }), cell('Property', { bold: true, w: 3500 }), cell('Placed', { bold: true, w: 1100 }), cell('Failed', { bold: true, w: 1100 })]),
    ...codes.map((c) =>
      rowOf([cell(c, { w: 1100 }), cell(PROP_NAME[c] ?? '', { w: 3500 }), cell(String(placedByCode[c] ?? 0), { w: 1100 }), cell(String(failedByCode[c] ?? 0), { w: 1100 })]),
    ),
  ]),
)

body.push(para('5. Failure snapshots', { heading: 2 }))
body.push(para('Each blocker below has a screenshot under image/pbs (named crew_testid_tier-code_tag_timestamp.png).', { spacingAfter: 60 }))
if (failures.length) {
  body.push(
    tableOf([
      rowOf([cell('Crew', { bold: true, w: 900 }), cell('Tier', { bold: true, w: 700 }), cell('Property', { bold: true, w: 2600 }), cell('Reason', { bold: true, w: 3000 }), cell('Snapshot', { bold: true, w: 3800 })]),
      ...failures.map((f) =>
        rowOf([
          cell(`#${f.crew}`, { w: 900 }),
          cell(f.tier ?? '', { w: 700 }),
          cell(`${f.code} ${f.name ?? ''}`, { w: 2600 }),
          cell((f.reason ?? '').slice(0, 80), { w: 3000 }),
          cell(f.image ? path.basename(f.image) : '(none)', { w: 3800 }),
        ]),
      ),
    ]),
  )
} else {
  body.push(para('No blockers recorded — all bids placed.'))
}

body.push(para('6. Run notes', { heading: 2 }))
const runNotes = [
  strictRunMetadata
    ? `This report is restricted to run ${fixture.runId}; stale issue files are excluded.`
    : 'This legacy fixture has no run metadata; results are scoped by fixture employee IDs only.',
  fixture.dateMode === 'no-shift'
    ? 'All source dates were preserved verbatim. Any out-of-period rejection is reported as a blocker rather than shifted.'
    : `Source dates were shifted to ${periodLabel} by the fixture generator.`,
  failures.length
    ? 'Review the blocker breakdown and screenshots before expanding the simulation scope.'
    : 'No blockers were recorded for this run.',
]
for (const line of runNotes) {
  body.push(para('• ' + line, { spacingAfter: 60 }))
}

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`

// ---- stage + zip ----
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'npbs-docx-'))
fs.mkdirSync(path.join(staging, '_rels'))
fs.mkdirSync(path.join(staging, 'word'))
fs.writeFileSync(path.join(staging, '[Content_Types].xml'), contentTypes)
fs.writeFileSync(path.join(staging, '_rels/.rels'), rootRels)
fs.writeFileSync(path.join(staging, 'word/document.xml'), documentXml)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.rmSync(outPath, { force: true })
execFileSync('zip', ['-r', '-X', '-q', outPath, '[Content_Types].xml', '_rels', 'word'], { cwd: staging })
fs.rmSync(staging, { recursive: true, force: true })

console.log(`Word report: ${path.relative(repoRoot, outPath)}`)
console.log(`  crew=${crewFiles.length} placed=${placedTotal}/${propTotal} (${pct}%) full=${full} partial=${partial} zero=${zero} blockers=${failures.length}`)
