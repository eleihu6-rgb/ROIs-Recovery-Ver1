import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { store } from '../../src/store';
import { MyTripsScreen } from '../../src/features/travel/MyTripsScreen';
import { setDuties } from '../../src/features/roster/dutiesSlice';
import { setTrips } from '../../src/features/travel/tripsSlice';
import type { PortalDuty } from '../../src/features/travel/portalCapture';

// MyTripsScreen transitively imports the WebView + document-picker (the Add-Trip
// / capture paths) — stub them so the screen can mount under Jest's node env.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: { pick: jest.fn(), types: {} },
  types: {},
  isCancel: () => false,
}));

const stringify = (component: renderer.ReactTestRenderer) =>
  JSON.stringify(component.toJSON(), (k, v) =>
    k === '_context' || k === '_owner' ? undefined : v,
  );

// A non-flight ground duty (Simulator) ending at `endUTCInstant` (a real UTC
// instant). The portal stores start/end in Bangkok BASE wall clock (UTC+7), so
// we add 7h to the desired UTC instant to build the stored base strings.
function simDutyEndingAt(startUTC: Date, endUTC: Date): PortalDuty {
  const base = (d: Date) => {
    const b = new Date(d.getTime() + 7 * 3600_000); // UTC → BKK base wall clock
    const p = (n: number) => String(n).padStart(2, '0');
    return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`;
  };
  return {
    id: 'sim-move-test',
    assignment: 'SIM',
    fltNum: '',
    dutyType: 'G',
    localStart: base(startUTC),
    localEnd: base(endUTC),
    startUTC: base(startUTC),
    endUTC: base(endUTC),
    briefStart: '',
    crewId: '42596',
    raw: {},
  };
}

const tap = (component: renderer.ReactTestRenderer, testID: string) => {
  const node = component.root.findByProps({ testID });
  act(() => {
    node.props.onPress();
  });
};

describe('MyTrips tabs', () => {
  afterEach(() => {
    act(() => {
      store.dispatch(setDuties([]));
      store.dispatch(setTrips([]));
    });
    jest.useRealTimers();
  });

  it('labels the tabs "Upcoming" / "Past" (not "… Trips") — the screen is more than trips now', () => {
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <Provider store={store}>
          <MyTripsScreen />
        </Provider>,
      );
    });
    const json = stringify(component);
    expect(json).toContain('Upcoming');
    expect(json).toContain('Past');
    // The narrower old labels must be gone.
    expect(json).not.toContain('Upcoming Trips');
    expect(json).not.toContain('Past Trips');
    act(() => component.unmount());
  });

  it('moves an activity from Upcoming → Past automatically as "now" ticks past its end', () => {
    // Fixed clock: the SIM duty ends at 10:05Z. We start at 10:00Z (it is
    // upcoming), then advance the clock to 10:06Z and let the 60s tick fire —
    // the screen must reclassify it into Past with NO data change.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-03T10:00:00Z'));

    act(() => {
      store.dispatch(
        setDuties([
          simDutyEndingAt(
            new Date('2026-06-03T09:50:00Z'),
            new Date('2026-06-03T10:05:00Z'),
          ),
        ]),
      );
    });

    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <Provider store={store}>
          <MyTripsScreen />
        </Provider>,
      );
    });

    // Default tab is Upcoming — the duty card (label "Simulator") shows there.
    expect(stringify(component)).toContain('Simulator');

    // Advance past the duty's end and fire the per-minute tick.
    act(() => {
      jest.setSystemTime(new Date('2026-06-03T10:06:00Z'));
      jest.advanceTimersByTime(60_000);
    });

    // It has left Upcoming (which is now empty)…
    expect(stringify(component)).not.toContain('Simulator');

    // …and is found under Past.
    tap(component, 'tab-past');
    expect(stringify(component)).toContain('Simulator');

    act(() => component.unmount());
  });
});
