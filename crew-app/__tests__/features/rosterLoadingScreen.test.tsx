import React from 'react';
import {StyleSheet} from 'react-native';
import {render} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RosterLoadingScreen} from '../../src/features/auth/RosterLoadingScreen';
import {PALETTES} from '../../src/theme/carrier';

describe('RosterLoadingScreen', () => {
  const renderLoading = (node: React.ReactElement) => render(
    <SafeAreaProvider initialMetrics={{
      frame: {x: 0, y: 0, width: 390, height: 844},
      insets: {top: 47, right: 0, bottom: 34, left: 0},
    }}>
      {node}
    </SafeAreaProvider>,
  );

  it('uses the supplied selected theme and shows the honest sign-in phase', () => {
    const screen = renderLoading(
      <RosterLoadingScreen
        palette={PALETTES.thai}
        airline="TG"
        airlineName="THAI"
        phase="signing-in"
      />,
    );

    expect(screen.getByText('Signing you in')).toBeTruthy();
    expect(screen.getByText('Connecting securely to THAI.')).toBeTruthy();
    expect(screen.queryByText('TG CREW PORTAL')).toBeNull();
    expect(screen.queryByText(/Crew 35459/)).toBeNull();
    expect(screen.getByText('Encrypted connection')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('roster-loading-brand').props.style).backgroundColor)
      .toBe(PALETTES.thai.btn);
    expect(StyleSheet.flatten(screen.getByTestId('roster-loading-card').props.style).backgroundColor)
      .toBe(PALETTES.thai.cardSolid);
  });

  it('shows roster scope once authentication has completed', () => {
    const screen = renderLoading(
      <RosterLoadingScreen
        palette={PALETTES.light}
        airline="PR"
        phase="loading-roster"
      />,
    );

    expect(screen.getByText('Preparing your roster')).toBeTruthy();
    expect(screen.getByText('Loading roster data')).toBeTruthy();
    expect(screen.getByText('Pulling your previous, current and next month duties.')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('roster-loading-brand').props.style).backgroundColor)
      .toBe(PALETTES.light.btn);
  });
});
