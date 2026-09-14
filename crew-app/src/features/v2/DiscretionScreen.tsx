// Home ▸ Quick actions ▸ Discretion — the crew's own FDP-discretion requests.
//
// Ryan, 2026-09-13: mirror the Absence "history" page. A crew can see anything
// still awaiting a reply (and answer it here) plus the terminal history
// (agreed / declined / expired / superseded). Reads live-server
// `POST /crew-app/v1/discretions` with the crew's own verified credentials.
import React, {useCallback, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

import {useAppDispatch, useAppSelector} from '../../store';
import {useCarrier, type CarrierPalette} from '../../theme/carrier';
import {AppDialog, type AppDialogTone} from '../../components/v2/AppDialog';
import {SectionLabel} from '../../components/v2/rows';
import {PageShell, PrimaryButton} from './PageShell';
import {DiscretionCard} from '../notifications/DiscretionCard';
import type {DiscretionRequest} from '../notifications/notificationsApi';
import {decideDiscretion, loadDiscretionHistory} from '../notifications/notificationsSlice';

type LoadState =
  | {kind: 'loading'}
  /** Signed in without an airline session (guest): there is nothing to read. */
  | {kind: 'signed-out'}
  | {kind: 'ready'; requests: DiscretionRequest[]}
  | {kind: 'error'; message: string};

export function DiscretionScreen(): React.JSX.Element {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const auth = useAppSelector(s => s.auth);
  const history = useAppSelector(s => s.notifications.discretionHistory);
  const decidingId = useAppSelector(s => s.notifications.decidingId);
  const credentials = {airline: auth.airline, crewId: auth.crewId ?? '', password: auth.password ?? ''};
  const [state, setState] = useState<LoadState>({kind: 'loading'});
  const [dialog, setDialog] = useState<{
    tone: AppDialogTone; title: string; message: string;
    cancelLabel?: string; confirmLabel: string; onConfirm?: () => void;
  } | null>(null);

  const load = useCallback(async () => {
    if (!credentials.crewId) {
      setState({kind: 'signed-out'});
      return;
    }
    setState({kind: 'loading'});
    try {
      const requests = await loadDiscretionHistory(dispatch, {credentials});
      setState({kind: 'ready', requests});
    } catch (e) {
      setState({kind: 'error', message: e instanceof Error ? e.message : 'Please try again.'});
    }
    // credentials is re-created each render but only its fields matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, auth.airline, auth.crewId, auth.password]);

  // Reload whenever the page is shown so a decision made in Alerts is reflected.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDecide = useCallback(
    (d: DiscretionRequest, decision: 'accept' | 'reject') => {
      const verb = decision === 'accept' ? 'Yes' : 'No';
      setDialog({
        tone: decision === 'reject' ? 'destructive' : 'neutral',
        title: `${verb} FDP discretion?`,
        message: decision === 'accept'
          ? `Agree to the proposed ${d.extensionRequestedMin}-min extension for duty ${d.dutyId}. Regulatory approval is separate.`
          : `Decline the extension for duty ${d.dutyId}.`,
        cancelLabel: 'Cancel',
        confirmLabel: verb,
        onConfirm: () => {
          decideDiscretion(dispatch, {discretionId: d.discretionId, decision, credentials})
            .then(() => load())
            .then(() => setDialog({tone: 'success', title: 'Decision sent', message: `FDP discretion ${decision === 'accept' ? 'accepted' : 'rejected'}.`, confirmLabel: 'Got it'}))
            .catch(e => setDialog({
              tone: 'destructive', title: 'Unable to send decision',
              message: e instanceof Error ? e.message : 'Try again.', confirmLabel: 'Got it',
            }));
        },
      });
    },
    // credentials is re-created each render; the fields are stable per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, auth.airline, auth.crewId, auth.password, load],
  );

  const requests = state.kind === 'ready' ? state.requests : history;
  const pending = requests.filter(r => r.state === 'pending');
  const past = requests.filter(r => r.state !== 'pending');

  return (
    <PageShell title="Discretion" testID="page-discretion">
      {state.kind === 'loading' && (
        <View style={s.state} testID="discretion-loading">
          <ActivityIndicator color={p.btn} />
          <Text style={[s.stateText, {color: p.cardSoft}]}>Loading your FDP requests…</Text>
        </View>
      )}
      {state.kind === 'signed-out' && (
        <Text style={[s.stateText, {color: p.cardSoft}]} testID="discretion-signed-out">
          Sign in with your airline on Profile first.
        </Text>
      )}
      {state.kind === 'error' && (
        <>
          <Text style={[s.stateText, {color: p.cardSoft}]} testID="discretion-error">{state.message}</Text>
          <PrimaryButton label="Try again" palette={p} testID="discretion-retry" onPress={() => void load()} />
        </>
      )}
      {state.kind === 'ready' && (
        <>
          {pending.length > 0 ? (
            <>
              <SectionLabel palette={p}>ACTION REQUIRED · {pending.length}</SectionLabel>
              {pending.map(d => (
                <DiscretionCard
                  key={d.discretionId}
                  request={d}
                  palette={p}
                  deciding={decidingId === d.discretionId}
                  onDecide={onDecide}
                />
              ))}
            </>
          ) : null}
          <SectionLabel palette={p}>HISTORY</SectionLabel>
          {past.length === 0 && pending.length === 0 ? (
            <Text style={[s.stateText, {color: p.cardSoft}]} testID="discretion-empty">
              No FDP discretion requests yet.
            </Text>
          ) : past.length === 0 ? (
            <Text style={[s.stateText, {color: p.cardSoft}]} testID="discretion-no-history">
              No earlier requests.
            </Text>
          ) : (
            past.map(d => (
              <DiscretionCard key={d.discretionId} request={d} palette={p} showActions={false} />
            ))
          )}
        </>
      )}
      <AppDialog
        visible={dialog !== null}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          const handler = dialog?.onConfirm;
          setDialog(null);
          handler?.();
        }}
        tone={dialog?.tone ?? 'neutral'}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        cancelLabel={dialog?.cancelLabel}
        confirmLabel={dialog?.confirmLabel}
        onCancel={() => setDialog(null)}
        testID="discretion-dialog"
      />
    </PageShell>
  );
}

const s = StyleSheet.create({
  state: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16},
  stateText: {fontSize: 13, lineHeight: 18, paddingVertical: 8},
});
