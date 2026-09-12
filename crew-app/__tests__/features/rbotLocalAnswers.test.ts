// R'Bot's local-first roster answers: the common crew questions are answered from
// the phone (nothing sent), and anything else falls through to the assistant.
import { answerLocally } from '../../src/features/rbot/localAnswers';
import type { Trip } from '../../src/features/travel/tripCsv';

const NOW = new Date(2026, 8, 11, 9, 0, 0); // Fri 11 Sep 2026, local

function trip(id: string, flt: string, day: number, dep: string, arv: string, hotel = ''): Trip {
  return {
    id,
    crewId: '35459',
    checkInDateUTC: `${String(day).padStart(2, '0')} Sep 2026 0600`,
    legs: [{
      crewId: '35459', fltNumber: flt,
      flightDateUTC: `${String(day).padStart(2, '0')} Sep 2026 0800`,
      depArp: dep, arvDateUTC: `${String(day).padStart(2, '0')} Sep 2026 1200`,
      arvArp: arv, fleet: '7M8', hotel,
      localDepTime: `2026-09-${String(day).padStart(2, '0')} 08:00`,
      localArvTime: `2026-09-${String(day).padStart(2, '0')} 12:00`,
      assignment: 'FLY',
    }],
  };
}

// Tomorrow (12 Sep) is a duty; today (11 Sep) is not.
const TRIPS: Trip[] = [
  trip('t1', 'ET805', 12, 'ADD', 'DMM', 'Hyatt Regency Dubai'),
  trip('t2', 'ET807', 15, 'ADD', 'DAR'),
];

const CTX = {now: NOW, trips: TRIPS, mode: 'airport' as const, baseTz: 'Asia/Riyadh', base: 'ADD'};

describe("R'Bot local answers", () => {
  it('answers the next-duty question from the roster', () => {
    const answer = answerLocally('what is my next duty?', CTX);
    expect(answer?.content).toContain('ET805');
    expect(answer?.content).toContain('12 Sep 2026');
    expect(answer?.content).toContain('ADD→DMM');
  });

  it('names the rotation destination, never "ADD→ADD" for a round trip', () => {
    // A real ET rotation: out to DMM, back to base on the second leg.
    const roundTrip: Trip = {
      id: 'rt',
      crewId: 'J4002',
      checkInDateUTC: '13 Sep 2026 2155',
      legs: [
        {...TRIPS[0].legs[0], fltNumber: 'ET422', depArp: 'ADD', arvArp: 'DMM', hotel: 'Radisson'},
        {...TRIPS[0].legs[0], fltNumber: 'ET423', depArp: 'DMM', arvArp: 'ADD', hotel: ''},
      ],
    };
    const answer = answerLocally('what is my next duty?', {...CTX, trips: [roundTrip]});
    expect(answer?.content).toContain('ADD→DMM');
    expect(answer?.content).not.toContain('ADD→ADD');
  });

  it('answers a check-in / report-time question for tomorrow', () => {
    const answer = answerLocally('what time do I check in tomorrow?', CTX);
    expect(answer?.content).toMatch(/^Tomorrow: ET805 ADD→DMM/);
    expect(answer?.content).toContain('check-in');
  });

  it('says plainly when a day has no duty', () => {
    const answer = answerLocally('do I work tomorrow?', CTX);
    expect(answer?.content).toMatch(/check-in|No duty|on duty/);
    const off = answerLocally('am I working today?', CTX);
    expect(off?.content).toBe('No duty on your roster today.');
  });

  it('answers the hotel question from the next rotation that has one', () => {
    const answer = answerLocally('where am I staying?', CTX);
    expect(answer?.content).toContain('Hyatt Regency Dubai');
    expect(answer?.content).toContain('DMM');
  });

  it('lists the destinations on the roster', () => {
    const answer = answerLocally('where am I flying this month?', CTX);
    expect(answer?.content).toContain('DMM');
    expect(answer?.content).toContain('DAR');
    // The base is where the crew lives, not a destination.
    expect(answer?.content).not.toContain('ADD');
  });

  it('has no local answer when the roster is empty', () => {
    const empty = {...CTX, trips: []};
    expect(answerLocally('what is my next duty?', empty)?.content)
      .toBe('You have no upcoming duty on your roster.');
    expect(answerLocally('do I work tomorrow?', empty)?.content)
      .toBe('No duty on your roster tomorrow.');
  });

  it('falls through to the assistant for anything that is not a roster fact', () => {
    for (const q of [
      'what does a DO duty mean?',
      'how do I claim my hotel expenses?',
      'tell me a joke',
      'can I swap my duty with someone?',
      '',
    ]) {
      expect(answerLocally(q, CTX)).toBeNull();
    }
  });

  it('does not answer an essay-length message locally', () => {
    expect(answerLocally(`what is my next duty ${'x'.repeat(400)}`, CTX)).toBeNull();
  });
});
