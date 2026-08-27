import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCoverageManifest,
  propertyCoverageKey,
  selectHighCoverageCrew,
} from './generate-coverage-manifest.mjs';

const property = (page, action, propertyCode, bid = { type: 'flag' }) => ({
  page,
  action,
  propertyCode,
  bid,
});

const crew = (employeeId, properties, dropped = []) => ({
  employeeId,
  category: 'YVR-737-FA',
  properties,
  dropped,
});

test('propertyCoverageKey distinguishes page, action, and property', () => {
  assert.equal(propertyCoverageKey(property('pairing', 'avoid', 117)), 'pairing|avoid|117');
});

test('selectHighCoverageCrew uses deterministic coverage-first ordering', () => {
  const crews = [
    crew('30', [property('pairing', 'award', 102)]),
    crew('20', [property('days-off', 'award', 201), property('pairing', 'avoid', 117)]),
    crew('10', [property('days-off', 'award', 201), property('pairing', 'award', 116)]),
  ];

  const result = selectHighCoverageCrew(crews, 2);

  assert.deepEqual(result.selected.map(({ crew: selectedCrew }) => selectedCrew.employeeId), ['10', '20']);
  assert.equal(result.covered.size, 3);
});

test('buildCoverageManifest binds coverage to source metadata and exclusions', () => {
  const manifest = buildCoverageManifest({
    sourceName: 'synthetic.txt',
    sourceSha256: 'a'.repeat(64),
    period: '202607',
    dateMode: 'no-shift',
    crews: [
      crew('19', [property('pairing', 'award', 102)]),
      crew('20', [property('days-off', 'award', 201), property('pairing', 'avoid', 117)]),
    ],
    excludedEmployeeIds: ['19'],
    selectionCount: 1,
  });

  assert.equal(manifest.sourceSha256, 'a'.repeat(64));
  assert.equal(manifest.eligibleCrew, 1);
  assert.deepEqual(manifest.propertyCoverage.recommendations.map((entry) => entry.employeeId), ['20']);
  assert.equal(manifest.propertyCoverage.selectedCoveragePercent, 100);
});

test('buildCoverageManifest preserves an explicit employee order', () => {
  const manifest = buildCoverageManifest({
    sourceName: 'synthetic.txt',
    sourceSha256: 'b'.repeat(64),
    period: '202607',
    dateMode: 'no-shift',
    crews: [
      crew('10', [property('days-off', 'award', 201)]),
      crew('20', [property('pairing', 'avoid', 117)]),
    ],
    excludedEmployeeIds: [],
    selectionCount: 2,
    selectedEmployeeIds: ['20', '10'],
  });

  assert.equal(manifest.selectionMode, 'explicit');
  assert.deepEqual(manifest.propertyCoverage.recommendations.map((entry) => entry.employeeId), ['20', '10']);
});
