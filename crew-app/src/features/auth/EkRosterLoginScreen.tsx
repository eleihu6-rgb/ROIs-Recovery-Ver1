import React, {useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AppDialog, type AppDialogTone} from '../../components/v2/AppDialog';
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
  // One product pop-up (pop-up standard: status card, not a native alert).
  // The crew stays on this screen until they acknowledge the failure, then we
  // go back (the old alert navigated away underneath itself).
  const [dialog, setDialog] = useState<{
    tone: AppDialogTone; title: string; message: string; confirmLabel: string; thenGoBack?: boolean;
  } | null>(null);
  function closeDialog() {
    const leave = dialog?.thenGoBack ?? false;
    setDialog(null);
    if (leave) navigation.goBack();
  }

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
        setDialog({
          tone: 'destructive',
          title: `Unable to load ${airline.name} roster`,
          message: error instanceof Error ? error.message : 'Try again.',
          confirmLabel: 'Got it',
          thenGoBack: true,
        });
      });

    return () => controller.abort();
  }, [airline.name, dispatch, navigation, route.params]);

  return (
    <GradientScreen palette={palette} texture={false}>
      <SafeAreaView style={styles.container} testID="ek-roster-loading">
        <ActivityIndicator size="large" color={palette.ink} />
        <Text style={[styles.text, { color: palette.ink }]}>Loading {airline.name} roster…</Text>
      </SafeAreaView>

      <AppDialog
        visible={dialog !== null}
        onClose={closeDialog}
        onConfirm={closeDialog}
        tone={dialog?.tone ?? 'neutral'}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        testID="ek-roster-dialog"
      />
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
