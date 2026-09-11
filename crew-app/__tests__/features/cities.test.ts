import { cityForAirport, tripDestination } from '../../src/features/home/cities';
import type { Trip, TripLeg } from '../../src/features/travel/tripCsv';

function leg(p: Partial<TripLeg>): TripLeg {
  return {
    crewId: '35459', fltNumber: 'TG000', flightDateUTC: '', depArp: '', arvDateUTC: '',
    arvArp: '', fleet: '', hotel: '', ...p,
  };
}
function trip(legs: TripLeg[]): Trip {
  return { id: 't', crewId: '35459', checkInDateUTC: '', legs };
}

describe('cityForAirport', () => {
  it('maps known crew-35459 destinations to a landmark city', () => {
    expect(cityForAirport('PVG').name).toBe('Shanghai');
    expect(cityForAirport('DPS').name).toBe('Bali');
    expect(cityForAirport('ARN').name).toBe('Stockholm');
    expect(cityForAirport('CAN').name).toBe('Guangzhou');
    expect(cityForAirport('ICN').name).toBe('Seoul');
    // each known city has an image
    expect(cityForAirport('PVG').image).toBeDefined();
  });
  it('falls back to the code + default image for unknown airports', () => {
    const c = cityForAirport('XYZ');
    expect(c.name).toBe('XYZ');
    expect(c.image).toBeDefined(); // default image
  });
});

describe('tripDestination — the turnaround city away from base', () => {
  it('out-and-back BKK→DPS→BKK → Bali', () => {
    const t = trip([
      leg({ fltNumber: 'TG431', depArp: 'BKK', arvArp: 'DPS' }),
      leg({ fltNumber: 'TG432', depArp: 'DPS', arvArp: 'BKK' }),
    ]);
    expect(tripDestination(t).name).toBe('Bali');
  });
  it('BKK→ARN (multi-day) → Stockholm', () => {
    const t = trip([
      leg({ fltNumber: 'TG960', depArp: 'BKK', arvArp: 'ARN' }),
      leg({ fltNumber: 'TG961', depArp: 'ARN', arvArp: 'BKK' }),
    ]);
    expect(tripDestination(t).name).toBe('Stockholm');
  });
  it('never returns base (BKK) as the destination', () => {
    const t = trip([leg({ depArp: 'BKK', arvArp: 'CGK' }), leg({ depArp: 'CGK', arvArp: 'BKK' })]);
    expect(tripDestination(t).airport).toBe('CGK');
    expect(tripDestination(t).name).toBe('Jakarta');
  });
});
