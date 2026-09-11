// Training-detail enrichment: the plain calendar lists a TRG duty but with no
// course info; the richer selectPortalCalendarDetailAll payload carries it in
// portalCalendarDetailRosterGroundInfoVoList[]. extractPortalDuties must merge
// the two so the training card can show course / role / location / device.
// Driven off real captures for crew 36826 (May 2026) — the 21 May TRG is the
// exact case in the user's screenshot (BTCFARE / CA FIRST AID RECURRENT / TE).

import { extractPortalDuties, type PortalCapture } from '../../src/features/travel/portalCapture';
import { toGroundDuty } from '../../src/features/roster/dutyDisplay';

const cal36826 = require('../fixtures/roster/cal_36826_2026-05.json');
const detailAll36826 = require('../fixtures/roster/detailAll_36826_2026-05.json');

const captures: PortalCapture[] = [
  { source: 'roster', url: 'selectPortalCalendar', body: cal36826 },
  { source: 'roster', url: 'selectPortalCalendarDetailAll', body: detailAll36826 },
];

describe('training detail enrichment (crew 36826, May 2026)', () => {
  const duties = extractPortalDuties(captures);

  it('attaches course detail to TRG duties from the detailAll payload', () => {
    const trg = duties.filter(d => d.assignment === 'TRG');
    expect(trg.length).toBeGreaterThan(0);
    // At least one TRG carries enriched course detail.
    const withCourse = trg.filter(d => d.training?.courseName);
    expect(withCourse.length).toBeGreaterThan(0);
  });

  it('the 21 May TRG matches the screenshot (BTCFARE / CA FIRST AID RECURRENT / TE / DMK-PB01)', () => {
    const d = duties.find(
      x => x.assignment === 'TRG' && x.startUTC.startsWith('2026-05-21') && x.startUTC.includes('08:00'),
    );
    expect(d).toBeDefined();
    expect(d!.training).toBeDefined();
    expect(d!.training).toMatchObject({
      courseName: 'BTCFARE',
      courseDesc: 'CA FIRST AID RECURRENT',
      role: 'TE',
      location: 'BKK',
      courseType: 'Ground',
      device: 'DMK/PB01',
    });
  });

  it('toGroundDuty carries the training detail through to the display model', () => {
    const d = duties.find(
      x => x.assignment === 'TRG' && x.startUTC.startsWith('2026-05-21') && x.startUTC.includes('08:00'),
    )!;
    const g = toGroundDuty(d);
    expect(g.category).toBe('training');
    expect(g.training?.courseName).toBe('BTCFARE');
    expect(g.training?.courseDesc).toBe('CA FIRST AID RECURRENT');
    expect(g.training?.role).toBe('TE');
  });

  it('non-training ground duties (OFF/VAC/OFFICE) get no training detail', () => {
    const others = duties.filter(d => ['OFF', 'VAC', 'OFFICE', 'MEETING'].includes(d.assignment));
    expect(others.length).toBeGreaterThan(0);
    expect(others.every(d => d.training == null)).toBe(true);
  });

  it('does not invent flights from the detailAll payload (duties still come from the calendar)', () => {
    // Every TRG duty is a ground duty (no fltNum) — detailAll must not leak the
    // nested flight rows into the FLY/duty set in a way that fabricates legs.
    const trg = duties.filter(d => d.assignment === 'TRG');
    expect(trg.every(d => d.fltNum === '' || d.fltNum == null)).toBe(true);
  });
});
