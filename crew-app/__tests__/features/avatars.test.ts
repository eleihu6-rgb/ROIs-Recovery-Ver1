// Crew cartoon avatars — each crew maps to a stable, in-range cute avatar so the
// Profile picture is a fun identity instead of a bare crew number.

import { avatarForCrew, avatarParts, AVATAR_COUNT, CHARACTER_COUNT } from '../../src/features/settings/avatars';

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

  // The picker (Profile ▸ tap the avatar) offers every combination of the 10
  // characters and their backings.
  it('exposes the full pickable set', () => {
    expect(CHARACTER_COUNT).toBe(10);
    expect(AVATAR_COUNT).toBe(30);
  });

  it('splits an index into a character and a backing that both stay in range', () => {
    for (let i = 0; i < AVATAR_COUNT; i++) {
      const { character, background } = avatarParts(i);
      expect(character).toBeGreaterThanOrEqual(0);
      expect(character).toBeLessThan(CHARACTER_COUNT);
      expect(background).toBeGreaterThanOrEqual(0);
      expect(background).toBeLessThan(AVATAR_COUNT / CHARACTER_COUNT);
    }
    // Same character, different backing — that's what "more avatars" buys.
    expect(avatarParts(3).character).toBe(3);
    expect(avatarParts(13).character).toBe(3);
    expect(avatarParts(13).background).toBe(1);
  });
});
