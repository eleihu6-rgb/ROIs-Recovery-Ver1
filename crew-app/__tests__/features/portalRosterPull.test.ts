import { pullPortalRoster } from '../../src/features/travel/portalRosterPull';

it('pulls TG previous/current/next calendar, report and detail payloads in parallel', async () => {
  const raw = jest.fn(async (_method: string, path: string, opts: { query: Record<string, string> }) => ({
    code: 0, message: null, data: { path, start: opts.query.startDateTime },
  }));
  const captures = await pullPortalRoster({ raw } as never, '35459', new Date(2026, 9, 21));

  expect(raw).toHaveBeenCalledTimes(9);
  expect(captures).toHaveLength(9);
  expect(captures.map(c => c.url)).toEqual(expect.arrayContaining([
    expect.stringContaining('selectPortalCalendar?crewId=35459&startDateTime=2026-09-01T00%3A00%3A00'),
    expect.stringContaining('selectCrewRosterReport?crewId=35459&startDateTime=2026-10-01T00%3A00%3A00'),
    expect.stringContaining('selectPortalCalendarDetailAll?crewId=35459&startDateTime=2026-11-01T00%3A00%3A00'),
  ]));
});

it('keeps successful TG roster payloads when one enrichment endpoint fails', async () => {
  let call = 0;
  const raw = jest.fn(async () => {
    if (++call === 2) throw new Error('report unavailable');
    return { code: 0, message: null, data: [] };
  });
  await expect(pullPortalRoster({ raw } as never, '35459', new Date(2026, 9, 21)))
    .resolves.toHaveLength(8);
});
