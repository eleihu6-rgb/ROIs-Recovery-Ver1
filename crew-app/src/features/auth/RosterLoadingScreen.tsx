import React from 'react';
import {ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {BrandLogo} from '../../components/v2/BrandLogo';
import {GradientScreen} from '../../components/v2/GradientScreen';
import {Icon} from '../../components/v2/icons';
import {colors, font, radius, space} from '../../theme';
import type {CarrierPalette} from '../../theme/carrier';

export type RosterLoadingPhase = 'signing-in' | 'loading-roster';

export function RosterLoadingScreen({
  palette,
  airline,
  airlineName,
  phase,
  testID = 'roster-loading-screen',
}: {
  palette: CarrierPalette;
  airline: string;
  airlineName?: string;
  phase: RosterLoadingPhase;
  testID?: string;
}): React.JSX.Element {
  const loadingRoster = phase === 'loading-roster';
  const title = loadingRoster ? 'Preparing your roster' : 'Signing you in';
  const detail = loadingRoster
    ? 'Pulling your previous, current and next month duties.'
    : `Connecting securely to ${airlineName ?? airline}.`;

  return (
    <GradientScreen palette={palette}>
      <StatusBar
        barStyle={palette.isLight ? 'dark-content' : 'light-content'}
        backgroundColor={palette.g1}
      />
      <SafeAreaView style={styles.safe} testID={testID}>
        <View style={styles.content}>
          <View style={[styles.brandPlate, {backgroundColor: palette.btn}]} testID="roster-loading-brand">
            <BrandLogo airline={airline} height={28} />
          </View>
          <Text style={[styles.heading, {color: palette.ink}]}>{title}</Text>

          <View
            style={[
              styles.card,
              {backgroundColor: palette.cardSolid, borderColor: palette.cardLine},
            ]}
            testID="roster-loading-card">
            <View style={[styles.spinnerShell, {backgroundColor: palette.cardInset}]}>
              <ActivityIndicator size="large" color={palette.btn} />
            </View>
            <Text style={[styles.cardTitle, {color: palette.cardInk}]}>
              {loadingRoster ? 'Loading roster data' : 'Secure sign-in'}
            </Text>
            <Text style={[styles.detail, {color: palette.cardSoft}]}>{detail}</Text>

            <View style={styles.steps} accessibilityLabel={loadingRoster ? 'Roster loading in progress' : 'Secure sign-in in progress'}>
              <View style={styles.stepItem}>
                <View style={[styles.stepIcon, {backgroundColor: palette.btn}]}>
                  <Icon name={loadingRoster ? 'check' : 'lock'} size={15} color={colors.white} />
                </View>
                <Text style={[styles.stepText, {color: palette.cardInk}]}>Secure sign-in</Text>
              </View>
              <View style={[styles.stepLine, {backgroundColor: loadingRoster ? palette.btn : palette.cardLine}]} />
              <View style={styles.stepItem}>
                <View style={[styles.stepIcon, {backgroundColor: loadingRoster ? palette.btn : palette.cardInset}]}>
                  <Icon name="cal" size={15} color={loadingRoster ? colors.white : palette.cardSoft} />
                </View>
                <Text style={[styles.stepText, {color: loadingRoster ? palette.cardInk : palette.cardSoft}]}>Roster sync</Text>
              </View>
            </View>
          </View>

          <View style={[styles.privacy, {backgroundColor: palette.frost, borderColor: palette.frostLine}]}>
            <Icon name="shield" size={16} color={palette.ink} />
            <Text style={[styles.privacyText, {color: palette.inkSoft}]}>Encrypted connection</Text>
          </View>
        </View>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl24,
    paddingVertical: space.xxl32,
  },
  brandPlate: {
    minWidth: 142,
    minHeight: 56,
    paddingHorizontal: space.lg16,
    paddingVertical: space.md12,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {...font.h1, marginTop: space.lg16, textAlign: 'center'},
  card: {
    width: '100%',
    marginTop: space.xl24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl24,
    paddingVertical: space.xl24,
    alignItems: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  spinnerShell: {
    width: 68,
    height: 68,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {...font.title, marginTop: space.lg16, textAlign: 'center'},
  detail: {...font.body, marginTop: space.sm8, textAlign: 'center', lineHeight: 22},
  steps: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl24,
  },
  stepItem: {alignItems: 'center', width: 104, gap: space.sm8},
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {height: 2, flex: 1, maxWidth: 92, marginBottom: 25},
  stepText: {...font.caption, textAlign: 'center'},
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm8,
    marginTop: space.lg16,
    paddingHorizontal: space.md12,
    paddingVertical: space.sm8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  privacyText: {...font.caption},
});
