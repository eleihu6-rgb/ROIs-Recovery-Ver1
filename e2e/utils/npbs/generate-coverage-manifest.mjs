// Generate a deterministic high-coverage crew manifest from an NPBS export.
// Source-derived output contains employee bid metadata and must stay untracked.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildCrewBids, selectContext, splitRecords } from './parse-npbs-bids.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const parseArgs = (argv) => {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }

    flags[value.slice(2)] = argv[index + 1] ?? '';
    index += 1;
  }

  return { flags, positionals };
};

const csv = (value) => String(value ?? '')
  .split(',')
  .map((part) => part.trim().toUpperCase())
  .filter(Boolean);

export const propertyCoverageKey = (property) =>
  `${property.page}|${property.action}|${property.propertyCode}`;

export const branchCoverageKey = (property) => {
  const bid = property.bid ?? {};
  const dateScope = bid.dateScope?.mode ?? (bid.dateScope ? 'date-scope' : 'no-date');

  return [
    property.page,
    property.action,
    property.propertyCode,
    bid.type ?? 'legacy',
    bid.event ?? '',
    bid.timeType ?? '',
    bid.mode ?? '',
    bid.operator ?? '',
    dateScope,
  ].join('|');
};

const unique = (values) => Array.from(new Set(values));

export const selectHighCoverageCrew = (crews, count) => {
  const remaining = [...crews];
  const selected = [];
  const covered = new Set();

  while (selected.length < count && remaining.length > 0) {
    remaining.sort((left, right) => {
      const gain = (crew) => unique(
        crew.properties.map(propertyCoverageKey).filter((key) => !covered.has(key)),
      ).length;

      return gain(right) - gain(left)
        || left.dropped.length - right.dropped.length
        || right.properties.length - left.properties.length
        || Number(left.employeeId) - Number(right.employeeId);
    });

    const crew = remaining.shift();
    if (!crew) break;

    const addedKeys = unique(
      crew.properties.map(propertyCoverageKey).filter((key) => !covered.has(key)),
    ).sort();
    crew.properties.map(propertyCoverageKey).forEach((key) => covered.add(key));
    selected.push({ crew, addedKeys, cumulativeCoverage: covered.size });
  }

  return { selected, covered };
};

export const buildCoverageManifest = ({
  sourceName,
  sourceSha256,
  period,
  dateMode,
  crews,
  excludedEmployeeIds,
  selectionCount,
  selectedEmployeeIds = [],
}) => {
  const eligibleCrews = crews.filter((crew) => !excludedEmployeeIds.includes(crew.employeeId));
  const propertyUniverse = unique(eligibleCrews.flatMap((crew) => crew.properties.map(propertyCoverageKey))).sort();
  const branchUniverse = unique(eligibleCrews.flatMap((crew) => crew.properties.map(branchCoverageKey))).sort();
  let selected;

  if (selectedEmployeeIds.length > 0) {
    const byEmployeeId = new Map(eligibleCrews.map((crew) => [crew.employeeId, crew]));
    const missingEmployeeIds = selectedEmployeeIds.filter((employeeId) => !byEmployeeId.has(employeeId));

    if (missingEmployeeIds.length > 0) {
      throw new Error(`Selected employee ids are not eligible: ${missingEmployeeIds.join(',')}`);
    }

    const covered = new Set();
    selected = selectedEmployeeIds.map((employeeId) => {
      const crew = byEmployeeId.get(employeeId);
      const addedKeys = unique(
        crew.properties.map(propertyCoverageKey).filter((key) => !covered.has(key)),
      ).sort();
      crew.properties.map(propertyCoverageKey).forEach((key) => covered.add(key));

      return { crew, addedKeys, cumulativeCoverage: covered.size };
    });
  } else {
    ({ selected } = selectHighCoverageCrew(eligibleCrews, selectionCount));
  }

  const recommendations = selected.map(({ crew, addedKeys, cumulativeCoverage }, index) => ({
    order: index + 1,
    employeeId: crew.employeeId,
    category: crew.category,
    mappedProperties: crew.properties.length,
    droppedProperties: crew.dropped.length,
    addedKeys,
    cumulativeCoverage,
    cumulativeCoveragePercent: Number(((cumulativeCoverage / propertyUniverse.length) * 100).toFixed(1)),
  }));
  const selectedKeys = new Set(
    selected.flatMap(({ crew }) => crew.properties.map(propertyCoverageKey)),
  );

  return {
    source: sourceName,
    sourceSha256,
    period,
    dateMode,
    generatedFrom: 'e2e/utils/npbs/generate-coverage-manifest.mjs',
    selectionMode: selectedEmployeeIds.length > 0 ? 'explicit' : 'greedy',
    excludedEmployeeIds,
    effectiveCrew: crews.length,
    eligibleCrew: eligibleCrews.length,
    propertyCoverage: {
      keyFormat: 'page|action|propertyCode',
      universe: propertyUniverse,
      universeCount: propertyUniverse.length,
      recommendations,
      selectedCoverageCount: selectedKeys.size,
      selectedCoveragePercent: Number(((selectedKeys.size / propertyUniverse.length) * 100).toFixed(1)),
      missingKeys: propertyUniverse.filter((key) => !selectedKeys.has(key)),
    },
    branchCoverage: {
      keyFormat: 'page|action|propertyCode|bid.type|event|timeType|mode|operator|dateScope',
      universe: branchUniverse,
      universeCount: branchUniverse.length,
    },
  };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const inputPath = positionals[0] ?? path.join(repoRoot, 'docs/test-cases/CLASS-BidsReport_March2026.txt');
  const outputPath = positionals[1];

  if (!outputPath) {
    console.error('Output path is required.');
    process.exit(2);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const sourceSha256 = createHash('sha256').update(raw).digest('hex');
  const crews = [...selectContext(splitRecords(raw)).values()].map(buildCrewBids);
  const selectionCount = Number(flags['selection-count'] ?? 8);

  if (!Number.isSafeInteger(selectionCount) || selectionCount < 1) {
    console.error('--selection-count must be a positive integer.');
    process.exit(2);
  }

  const manifest = buildCoverageManifest({
    sourceName: path.basename(inputPath),
    sourceSha256,
    period: String(flags.period ?? '202607'),
    dateMode: String(flags['date-mode'] ?? 'no-shift'),
    crews,
    excludedEmployeeIds: csv(flags['exclude-employee-ids']),
    selectionCount,
    selectedEmployeeIds: csv(flags['employee-ids']),
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Coverage manifest: ${outputPath}`);
  console.log(`Source SHA-256: ${sourceSha256}`);
  console.log(`Property coverage: ${manifest.propertyCoverage.selectedCoverageCount}/${manifest.propertyCoverage.universeCount}`);
  console.log(`Recommended crew: ${manifest.propertyCoverage.recommendations.map((entry) => entry.employeeId).join(',')}`);
}
