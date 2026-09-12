// Ryan, 2026-09-11: "EK crew shows ET logo".
//
// The sign-in picker only chooses which roster service answers — the ROIS
// mobile-roster endpoint answers the ET and F8 options alike — so branding must
// follow the crew's OWN carrier, which the roster now reports. Crew K1003
// (Khalid Al Nuaimi, CA, A380, DXB) flies Emirates: the app must draw the
// Emirates mark and the Emirates ground, not the Ethiopian ones.
import { crewCarrierOf } from '../../src/features/travel/ekRosterApi';
import authReducer, {
  publishPersistedSession,
  selectCrewCarrier,
} from '../../src/features/auth/authSlice';
import { BrandLogo } from '../../src/components/v2/BrandLogo';
import React from 'react';
import { render } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import {
  PALETTES,
  presetForAirline,
  resolveTheme,
  THEME_PRESETS,
} from '../../src/theme/carrier';

describe('crew carrier resolution', () => {
  it('uses the carrier the roster reported, not the signed-in airline', () => {
    expect(crewCarrierOf({
      airline: 'ET',
      crew: {carrier: 'EK'},
    })).toBe('EK');
  });

  it('falls back to the signed-in airline for older servers with no carrier', () => {
    expect(crewCarrierOf({airline: 'ET'})).toBe('ET');
    expect(crewCarrierOf({airline: 'ET', crew: {carrier: null}})).toBe('ET');
    expect(crewCarrierOf({airline: 'f8', crew: {carrier: '   '}})).toBe('F8');
  });

  it('normalises the carrier to upper case so it can key artwork and themes', () => {
    expect(crewCarrierOf({airline: 'ET', crew: {carrier: 'ek'}})).toBe('EK');
  });
});

describe('carrier-branded theme', () => {
  it('gives an Emirates crew the Emirates ground instead of the ET emerald', () => {
    expect(presetForAirline('EK')).toBe('emirates');
    expect(presetForAirline('ET')).toBe('emerald');
    expect(PALETTES.emirates).toBeDefined();
    expect(PALETTES.emirates.g1).not.toBe(PALETTES.emerald.g1);
  });

  it('keeps Emirates as a carrier default only — the crew still picks the same four', () => {
    expect(THEME_PRESETS).toEqual(['sia', 'thai', 'emerald', 'graphite']);
  });

  it('lets an explicit crew choice still win over the carrier ground', () => {
    expect(resolveTheme('graphite', 'EK')).toBe('graphite');
    expect(resolveTheme(null, 'EK')).toBe('emirates');
  });
});

describe('session carrier', () => {
  const session = {airline: 'ET', crewId: 'K1003', password: 'Pier2026', keepLogin: true};

  it('stores the roster carrier beside the sign-in airline', () => {
    const state = authReducer(undefined, publishPersistedSession({...session, carrier: 'EK'}));
    expect(state.airline).toBe('ET'); // which roster service answered
    expect(state.carrier).toBe('EK'); // which airline the crew actually flies
  });

  it('leaves the carrier unset for a login that cannot resolve one', () => {
    const state = authReducer(undefined, publishPersistedSession(session));
    expect(state.carrier).toBeNull();
  });

  it('drops the carrier on logout so the next crew starts clean', () => {
    const withCarrier = authReducer(undefined, publishPersistedSession({...session, carrier: 'EK'}));
    const loggedOut = authReducer(withCarrier, {type: 'auth/_clearSession'});
    expect(loggedOut.carrier).toBeNull();
    expect(loggedOut.crewId).toBeNull();
  });
});

describe('no crew-facing screen brands from the sign-in airline', () => {
  // Ryan hit this twice — the Home header AND the Profile carrier chip both read
  // `auth.airline` and printed "Ethiopian Airlines" for Emirates crew K1003. The
  // rule is `selectCrewCarrier` (carrier ?? airline); only portal configuration
  // may read the signed-in airline directly, and it is listed here by name.
  const REPO = path.resolve(__dirname, '..', '..');
  const SCAN_DIRS = ['src/features/v2', 'src/features/rbot', 'src/features/tripTrade'];
  const PORTAL_CONFIG_ONLY: Record<string, string> = {
    'src/features/v2/useV2.ts':
      'base airport comes from the signed-in carrier\'s portalConfig',
    'src/features/v2/AbsenceScreen.tsx':
      'absence submit posts the signed-in airline to the roster service',
  };

  const filesUnder = (dir: string): string[] => fs.readdirSync(path.join(REPO, dir))
    .flatMap(entry => {
      const rel = path.join(dir, entry);
      const abs = path.join(REPO, rel);
      if (fs.statSync(abs).isDirectory()) {
        return filesUnder(rel);
      }
      return /\.tsx?$/.test(entry) ? [rel] : [];
    });

  it('only reads auth.airline in the listed portal-config files', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const rel of filesUnder(dir)) {
        if (PORTAL_CONFIG_ONLY[rel]) {
          continue;
        }
        const source = fs.readFileSync(path.join(REPO, rel), 'utf8');
        if (/\.auth\.airline\b/.test(source)) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exposes the carrier rule in one place', () => {
    expect(selectCrewCarrier({auth: {airline: 'ET', carrier: 'EK'}})).toBe('EK');
    expect(selectCrewCarrier({auth: {airline: 'ET', carrier: null}})).toBe('ET');
  });
});

describe('Emirates brand mark', () => {
  // Ryan, 2026-09-11: "EK crew shows ET logo". EK is artwork-driven now, so the
  // header draws the Emirates mark instead of falling back to the generic
  // "jet glyph + airline code" mark (which is also why 'EK' must not be printed).
  it('draws the Emirates mark for EK instead of printing the airline code', () => {
    const tree = render(React.createElement(BrandLogo, { airline: 'EK' }));
    expect(tree.queryByText('EK')).toBeNull();
  });
});
