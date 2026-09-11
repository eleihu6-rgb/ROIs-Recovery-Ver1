// Explore feature (doc/Explore Ver1) — layover place recommendations.
//
// Golden-path scenario from the spec: crew 42596, interests café / Thai food /
// shopping, on the 1 Jun ANA Crowne Plaza Chitose (CTS) layover. Explore must
// show the TOP-3 RATED places of each interest within a 15-minute walk.

import {
  suggestionsFor,
  hasPlaces,
  placeMapsQuery,
  placeDirectionsUrl,
  placeDirectionsAppUrl,
  APP_URL_SCHEME,
  EXPLORE_CATEGORIES,
  DEFAULT_EXPLORE_PREFS,
  MAX_WALK_MINS,
  TOP_N,
  PLACES_BY_AIRPORT,
  type Place,
} from '../../src/features/explore/explorePlaces';

describe('Explore — crew 42596 / ANA Crowne Plaza Chitose (CTS)', () => {
  const PREFS = ['cafe', 'thai', 'shopping']; // café, Thai food, shopping

  it('has curated places for the Chitose (CTS) layover', () => {
    expect(hasPlaces('CTS')).toBe(true);
    expect(hasPlaces('cts')).toBe(true); // case-insensitive
    expect(hasPlaces('ZZZ')).toBe(false);
    expect(hasPlaces(undefined)).toBe(false);
  });

  it('returns one suggestion group per chosen interest, in pref order', () => {
    const s = suggestionsFor('CTS', PREFS);
    expect(s.map(g => g.category.key)).toEqual(['cafe', 'thai', 'shopping']);
  });

  it('shows the top 3 rated places for each of the 3 interests', () => {
    const s = suggestionsFor('CTS', PREFS);
    for (const group of s) {
      expect(group.places.length).toBe(TOP_N); // exactly 3 available within walk
      // ranked by rating, descending
      const ratings = group.places.map(p => p.rating);
      expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
      // every place is the right category and within the 15-min walk
      for (const p of group.places) {
        expect(p.category).toBe(group.category.key);
        expect(p.walkMins).toBeLessThanOrEqual(MAX_WALK_MINS);
      }
    }
  });

  it('excludes higher-rated places beyond a 15-minute walk', () => {
    // "Hilltop Roastery" (4.8) is the best café but a 24-min walk — it must NOT
    // appear, and the nearer 4.6 spot leads instead.
    const cafe = suggestionsFor('CTS', ['cafe'])[0];
    const names = cafe.places.map(p => p.name);
    expect(names).not.toContain('Hilltop Roastery');
    expect(cafe.places[0].rating).toBe(4.6);
    expect(cafe.places.every(p => p.walkMins <= MAX_WALK_MINS)).toBe(true);
  });

  it('shopping is led by the highest-rated nearby mall, far outlet excluded', () => {
    const shopping = suggestionsFor('CTS', ['shopping'])[0];
    const names = shopping.places.map(p => p.name);
    expect(names).not.toContain('Mitsui Outlet Park Rera'); // 35-min walk
    expect(shopping.places[0].name).toBe('Aeon Chitose'); // 4.4, nearest top
  });

  it('respects the crew interest selection (deselecting drops a group)', () => {
    const justThai = suggestionsFor('CTS', ['thai']);
    expect(justThai).toHaveLength(1);
    expect(justThai[0].category.key).toBe('thai');
  });

  it('returns nothing for an unknown category or uncovered city', () => {
    expect(suggestionsFor('CTS', ['not-a-real-pref'])).toEqual([]);
    expect(suggestionsFor('ZZZ', ['cafe'])).toEqual([]);
    expect(suggestionsFor(undefined, ['cafe'])).toEqual([]);
  });

  it('exposes 3–10 predefined interest options with stable keys', () => {
    expect(EXPLORE_CATEGORIES.length).toBeGreaterThanOrEqual(3);
    expect(EXPLORE_CATEGORIES.length).toBeLessThanOrEqual(10);
    for (const c of EXPLORE_CATEGORIES) {
      expect(typeof c.key).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
    }
    // every default pref maps to a real category
    const keys = new Set(EXPLORE_CATEGORIES.map(c => c.key));
    for (const p of DEFAULT_EXPLORE_PREFS) {
      expect(keys.has(p as any)).toBe(true);
    }
  });

  it('builds a Google Maps directions deep link for quick navigation', () => {
    const place: Place = {
      name: 'Hokkaido Coffee & Bakery',
      category: 'cafe',
      rating: 4.6,
      walkMins: 8,
      area: 'Ekimae-dori',
    };
    expect(placeMapsQuery(place, 'Chitose')).toBe(
      'Hokkaido Coffee & Bakery, Ekimae-dori, Chitose',
    );
    const url = placeDirectionsUrl(place, 'Chitose');
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent('Hokkaido Coffee & Bakery, Ekimae-dori, Chitose'),
    );
    // URL-encoded (spaces/commas escaped) so it survives Linking.openURL.
    expect(url).toContain('%2C'); // encoded comma
    expect(url).not.toContain(' ');
    // City is optional — query still resolves to the place name.
    expect(placeDirectionsUrl({ ...place, area: undefined })).toContain(
      encodeURIComponent('Hokkaido Coffee & Bakery'),
    );
  });

  it('builds a Google Maps x-callback link with a "back to R\'Bot" shortcut', () => {
    const place: Place = {
      name: 'Hokkaido Coffee & Bakery',
      category: 'cafe',
      rating: 4.6,
      walkMins: 8,
      area: 'Ekimae-dori',
    };
    const url = placeDirectionsAppUrl(place, 'Chitose');
    // Opens the Google Maps app in walking mode (layover spots are a short walk).
    expect(url.startsWith('comgooglemaps-x-callback://')).toBe(true);
    expect(url).toContain('directionsmode=walking');
    expect(url).toContain(
      `daddr=${encodeURIComponent('Hokkaido Coffee & Bakery, Ekimae-dori, Chitose')}`,
    );
    // The crucial bit: x-success bounces back to our own scheme, and x-source is
    // the label shown on the Google Maps back button.
    expect(url).toContain(`x-success=${encodeURIComponent(APP_URL_SCHEME)}`);
    expect(url).toContain(`x-source=${encodeURIComponent("R'Bot")}`);
    expect(APP_URL_SCHEME).toBe('rbot://');
  });

  it('every curated CTS place carries a real category, rating and walk time', () => {
    const keys = new Set(EXPLORE_CATEGORIES.map(c => c.key));
    for (const p of PLACES_BY_AIRPORT.CTS) {
      expect(keys.has(p.category)).toBe(true);
      expect(p.rating).toBeGreaterThan(0);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(p.walkMins).toBeGreaterThan(0);
    }
  });
});
