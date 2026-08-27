/** Shared sample data for all Quality Analyzer mockups */
const QA_DATA = {
  totalCrew: 147,
  crewWithFindings: 67,
  rules: [
    {
      id: 'Qlty-1001',
      key: 'standalone-res',
      label: 'Standalone RES',
      description: 'Isolated reserve/standby day with no adjacent reserve day (need ≥2 consecutive).',
      crewCount: 12,
      crew: [
        { id: '1204', base: 'YYC', rank: 'CA', detail: ['2026-06-04', '2026-06-18', '2026-06-22'] },
        { id: '883', base: 'YVR', rank: 'FO', detail: ['2026-06-11'] },
        { id: '672', base: 'YYZ', rank: 'FA', detail: ['2026-06-02', '2026-06-25'] },
        { id: '441', base: 'YVR', rank: 'CA', detail: ['2026-06-09'] },
      ],
    },
    {
      id: 'Qlty-1002',
      key: 'consecutive-working',
      label: 'Working >6d',
      description: 'Run of more than 6 consecutive working days (flight, sim or reserve).',
      crewCount: 58,
      crew: [
        { id: '446', base: 'YVR', rank: 'IFD', leadIn: '—', before: '—', after: '108:50', detail: ['2026-06-07 – 2026-06-13 (7d)'] },
        { id: '905', base: 'YVR', rank: 'FD', leadIn: '—', before: '—', after: '134:20', detail: ['2026-06-07 – 2026-06-13 (7d)'] },
        { id: '516', base: 'YVR', rank: 'IFD', leadIn: '—', before: '—', after: '112:05', detail: ['2026-06-14 – 2026-06-21 (8d)', '2026-06-01 – 2026-06-08 (8d)'] },
        { id: '911', base: 'YVR', rank: 'FA', leadIn: '—', before: '—', after: '98:30', detail: ['2026-06-03 – 2026-06-10 (8d)'] },
        { id: '338', base: 'YYC', rank: 'FO', leadIn: '12:00', before: '—', after: '121:45', detail: ['2026-06-19 – 2026-06-26 (8d)'] },
      ],
    },
    {
      id: 'Qlty-1003',
      key: 'day-off-only',
      label: 'Day-off only',
      description: 'Entire roster is days off — no flying or reserve (possible data issue).',
      crewCount: 5,
      crew: [
        { id: '2091', base: 'YYZ', rank: 'CA', detail: ['Full period — no assignments'] },
        { id: '1877', base: 'YVR', rank: 'FA', detail: ['Full period — no assignments'] },
      ],
    },
  ],
};
