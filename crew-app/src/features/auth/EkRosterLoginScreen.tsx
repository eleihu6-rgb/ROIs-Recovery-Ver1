import React, {useEffect} from 'react';
import {ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {AuthStackParamList} from '../../navigation/RootNavigator';
import {useAppDispatch} from '../../store';
import {colors, font, space} from '../../theme';
import {airlineByCode} from './airlines';
import {isEkRosterLoginAbortError, loadEkRosterSession} from './ekRosterLogin';

type Props = NativeStackScreenProps<AuthStackParamList, 'EkRoster'>;

export function EkRosterLoginScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const airline = airlineByCode(route.params.airline);

  useEffect(() => {
    const controller = new AbortController();

    loadEkRosterSession(route.params, dispatch, controller.signal)
      .then(result => {
        // The roster is live; only the "keep me logged in" promise is broken.
        // Warn without sending the crew back to the login screen.
        if (result.persisted || !route.params.keepLogin) {
          return;
        }
        Alert.alert(
          `Signed in to ${airline.name}`,
          'Your roster loaded, but this device could not save your login. '
            + 'You will be asked to sign in again next time.',
        );
      })
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
    <SafeAreaView style={styles.container} testID="ek-roster-loading">
      <ActivityIndicator size="large" color={colors.onPrimary} />
      <Text style={styles.text}>Loading {airline.name} roster…</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  text: {
    ...font.body,
    color: colors.onPrimary,
    marginTop: space.md12,
  },
});
