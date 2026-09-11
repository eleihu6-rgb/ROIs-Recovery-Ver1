// Crew cartoon avatars — each crew maps to a stable, in-range cute avatar so the
// Profile picture is a fun identity instead of a bare crew number.

import { avatarForCrew, AVATAR_COUNT } from '../../src/features/settings/avatars';

describe('avatarForCrew', () => {
  it('returns an index within [0, AVATAR_COUNT)', () => {
    for (const id of ['42596', '35459', '44117', 'ABC', '0', '99999999']) {
      const i = avatarForCrew(id);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(AVATAR_COUNT);
    }
  });

  it('is stable for the same crew (same avatar every login)', () => {
    expect(avatarForCrew('42596')).toBe(avatarForCrew('42596'));
    expect(avatarForCrew('35459')).toBe(avatarForCrew('35459'));
  });

  it('spreads different crews across multiple avatars', () => {
    const crews = ['36826', '39243', '26985', '23605', '35459', '44117', '45779', '44448', '44661', '42596'];
    const used = new Set(crews.map(avatarForCrew));
    expect(used.size).toBeGreaterThanOrEqual(4); // not all collapsed onto one
  });

  it('is null/empty safe', () => {
    expect(avatarForCrew(null)).toBe(0);
    expect(avatarForCrew(undefined)).toBe(0);
    expect(avatarForCrew('')).toBe(0);
  });

  it('exposes a 10-avatar set', () => {
    expect(AVATAR_COUNT).toBe(10);
  });
});
