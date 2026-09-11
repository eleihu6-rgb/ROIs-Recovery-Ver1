import React, {useEffect} from 'react';
import {ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {AuthStackParamList} from '../../navigation/RootNavigator';
import {useAppDispatch} from '../../store';
import {font, space} from '../../theme';
import {GradientScreen} from '../../components/v2/GradientScreen';
import {paletteFor, presetForAirline} from '../../theme/carrier';
import {airlineByCode} from './airlines';
import {isEkRosterLoginAbortError, loadEkRosterSession} from './ekRosterLogin';

type Props = NativeStackScreenProps<AuthStackParamList, 'EkRoster'>;

export function EkRosterLoginScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const airline = airlineByCode(route.params.airline);
  // Same palette as the screen the crew just left and the Home they land on —
  // the loading page used to be the app-theme purple, unrelated to either.
  const palette = paletteFor(presetForAirline(route.params.airline));

  useEffect(() => {
    const controller = new AbortController();

    // A successful sign-in just navigates on. A device that cannot remember the
    // login (Keychain unavailable) simply asks for it again next launch — that is
    // not worth a pop-up over the crew's own roster (Ryan, 2026-09-11).
    loadEkRosterSession(route.params, dispatch, controller.signal)
      .catch(error => {
        if (isEkRosterLoginAbortError(error)) {
          return;
        }
        Alert.alert(
          `Unable to load ${airline.name} roster`,
          error instanceof Error ? error.message : 'Try again.',
        );
        navigation.goBack();
      });

    return () => controller.abort();
  }, [airline.name, dispatch, navigation, route.params]);

  return (
    <GradientScreen palette={palette} texture={false}>
      <SafeAreaView style={styles.container} testID="ek-roster-loading">
        <ActivityIndicator size="large" color={palette.ink} />
        <Text style={[styles.text, { color: palette.ink }]}>Loading {airline.name} roster…</Text>
      </SafeAreaView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...font.body,
    marginTop: space.md12,
  },
});
