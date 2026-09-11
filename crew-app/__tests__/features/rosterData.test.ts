import { rosterData, groupByCheckIn } from '../../src/features/roster/rosterData';

describe('rosterData', () => {
  it('has 8 entries matching the CSV', () => {
    expect(rosterData).toHaveLength(8);
  });

  it('all entries belong to crew 891939', () => {
    expect(rosterData.every(r => r.crewId === '891939')).toBe(true);
  });

  it('all entries use A350 fleet', () => {
    expect(rosterData.every(r => r.fleet === '350')).toBe(true);
  });

  it('only FA200 has a hotel', () => {
    const withHotel = rosterData.filter(r => r.hotel.trim() !== '');
    expect(withHotel).toHaveLength(1);
    expect(withHotel[0].fltNumber).toBe('FA200');
    expect(withHotel[0].hotel).toBe('Hyatt Regency');
  });
});

describe('groupByCheckIn', () => {
  const sections = groupByCheckIn(rosterData);

  it('produces 3 duty groups', () => {
    expect(sections).toHaveLength(3);
  });

  it('first duty group has 4 legs (20 May)', () => {
    expect(sections[0].title).toBe('01 Jun 2026 0100');
    expect(sections[0].data).toHaveLength(4);
  });

  it('second duty group has 2 legs (01 Jun TPE-HKG-TPE)', () => {
    expect(sections[1].data).toHaveLength(2);
    expect(sections[1].data[0].depArp).toBe('TPE');
    expect(sections[1].data[1].arvArp).toBe('TPE');
  });

  it('third duty group has 2 legs (03–06 Jun YVR)', () => {
    expect(sections[2].title).toBe('03 Jun 2026 0100');
    expect(sections[2].data).toHaveLength(2);
    expect(sections[2].data[0].arvArp).toBe('YVR');
    expect(sections[2].data[1].depArp).toBe('YVR');
  });

  it('YVR leg has hotel information', () => {
    const yvrLeg = sections[2].data[0];
    expect(yvrLeg.hotel).toBe('Hyatt Regency');
  });
});
