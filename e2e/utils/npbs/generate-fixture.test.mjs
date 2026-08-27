import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const generator = path.join(here, 'generate-fixture.mjs');
const LONG = '-'.repeat(76);
const SHORT = '-'.repeat(51);

const record = (employeeId, predicate) => [
  LONG,
  `Seniority ${employeeId} Category YYZ-737-FO Employee # ${employeeId}`,
  'Current Bid',
  LONG,
  'Bid Preferences:',
  SHORT,
  `1. ${predicate}`,
].join('\r\n');

test('generator selects exact employees and preserves dates with --no-shift', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npbs-fixture-test-'));
  const input = path.join(temp, 'CLASS-BidsReport_July2026.txt');
  const fixturePath = path.join(temp, 'fixture.json');
  const reportPath = path.join(temp, 'report.json');
  fs.writeFileSync(input, [
    record('19', 'Prefer Off Jul 1, 2026'),
    record('73', 'Prefer Off Mar 3, 2026'),
    record('113', 'Prefer Off Jul 5, 2026'),
  ].join('\r\n'));

  const result = spawnSync(process.execPath, [
    generator,
    input,
    fixturePath,
    reportPath,
    '--period-start', '2026-07-01',
    '--period-end', '2026-07-31',
    '--employee-ids', '73,113',
    '--no-shift',
    '--run-id', 'smoke-test-run',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  assert.deepEqual(fixture.crew.map((crew) => crew.employeeId), ['73', '113']);
  assert.equal(fixture.period, '202607');
  assert.equal(fixture.dateMode, 'no-shift');
  assert.equal(fixture.runId, 'smoke-test-run');
  assert.match(fixture.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(fixture.crew[0].properties[0].bid.values[0], 'Mar 3, 2026');
  assert.equal(report.effectiveCrew, 3);
  assert.equal(report.mappedProperties, 3);
  assert.equal(report.droppedProperties, 0);
  assert.equal(report.runId, fixture.runId);
});
