import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppDialog } from '../../components/v2/AppDialog';
import { SectionLabel } from '../../components/v2/rows';
import { useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { airlineByCode } from '../auth/airlines';
import { ListCard, PageShell, PrimaryButton } from '../v2/PageShell';
import { buildM5TripSnapshot, formatCountdown } from './m5DisplayModel';
import {
  connectM5Display,
  disconnectM5Display,
  getM5DisplayStatus,
  subscribeM5DisplayStatus,
  type M5DisplayConnectionState,
} from './m5DisplayModule';

const STATUS_LABELS: Record<M5DisplayConnectionState, string> = {
  unsupported: 'Unavailable',
  'permission-denied': 'Bluetooth permission needed',
  'bluetooth-off': 'Bluetooth is off',
  disconnected: 'Not connected',
  scanning: 'Looking for M5',
  connecting: 'Connecting',
  connected: 'Connected',
};

export function M5DisplayScreen() {
  const p = useCarrier();
  const trips = useAppSelector(state => state.trips.trips);
  const rosterBase = useAppSelector(state => state.auth.base);
  const airline = useAppSelector(state => state.auth.airline);
  const base = rosterBase || airlineByCode(airline ?? '').portalConfig?.baseAirport || 'BKK';
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState<M5DisplayConnectionState>('disconnected');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useMemo(() => buildM5TripSnapshot(trips, base, now), [trips, base, now]);

  useEffect(() => {
    void getM5DisplayStatus().then(setStatus);
    return subscribeM5DisplayStatus(setStatus);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      await connectM5Display();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to the M5 Crew Display.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectM5Display();
      setStatus('disconnected');
    } finally {
      setBusy(false);
    }
  };

  const isConnected = status === 'connected';
  return (
    <PageShell title="M5 Crew Display" testID="page-m5-display">
      <SectionLabel palette={p}>Connection</SectionLabel>
      <ListCard palette={p}>
        <View style={s.connectionRow}>
          <View style={[s.dot, { backgroundColor: isConnected ? p.btn : p.cardLine }]} />
          <View style={s.connectionCopy}>
            <Text style={[s.label, { color: p.cardInk }]}>ROIS Crew Display</Text>
            <Text style={[s.sub, { color: p.cardSoft }]} testID="m5-connection-status">
              {STATUS_LABELS[status]}
            </Text>
          </View>
        </View>
      </ListCard>

      <SectionLabel palette={p}>M5 preview</SectionLabel>
      <View style={[s.preview, { backgroundColor: p.g1, borderColor: p.frostLine }]} testID="m5-trip-preview">
        {snapshot ? (
          <>
            <Text style={[s.eyebrow, { color: p.inkSoft }]}>UPCOMING TRIP · {snapshot.destination}</Text>
            <Text style={[s.city, { color: p.ink }]} numberOfLines={1}>{snapshot.city}</Text>
            <View style={[s.routePill, { backgroundColor: p.frostStrong }]}>
              <Text style={[s.route, { color: p.ink }]}>{snapshot.flight} · {snapshot.route}</Text>
            </View>
            <Text style={[s.countdownLabel, { color: p.inkSoft }]}>TO CHECK-IN</Text>
            <Text style={[s.countdown, { color: p.ink }]} testID="m5-checkin-countdown">
              {formatCountdown(snapshot.checkInEpoch, now)}
            </Text>
            <Text style={[s.checkIn, { color: p.inkSoft }]}>Check-in {snapshot.checkInLocal} · {snapshot.legCount} leg{snapshot.legCount === 1 ? '' : 's'}</Text>
          </>
        ) : (
          <View style={s.empty}>
            <Text style={[s.city, { color: p.ink }]}>No upcoming trip</Text>
            <Text style={[s.sub, { color: p.inkSoft }]}>The display will update after your roster has an upcoming duty.</Text>
          </View>
        )}
      </View>

      <Text style={[s.help, { color: p.inkSoft }]}>Keep the M5 nearby and awake. Crew App sends only this trip summary—never your crew ID, password, or portal session.</Text>
      <PrimaryButton
        label={busy ? 'Please wait…' : isConnected ? 'Disconnect M5' : 'Connect M5'}
        onPress={busy ? undefined : isConnected ? disconnect : connect}
        palette={p}
        testID="m5-connect-button"
      />

      <AppDialog
        visible={error !== null}
        onClose={() => setError(null)}
        onConfirm={() => setError(null)}
        tone="warning"
        title="M5 connection unavailable"
        message={error ?? undefined}
        confirmLabel="Got it"
        testID="m5-error-dialog"
      />
    </PageShell>
  );
}

const s = StyleSheet.create({
  connectionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectionCopy: { flex: 1, gap: 3 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, lineHeight: 17 },
  preview: { minHeight: 310, borderRadius: 155, borderWidth: 1, paddingHorizontal: 38, paddingVertical: 42, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.1 },
  city: { fontSize: 30, lineHeight: 36, fontWeight: '600', marginTop: 7, textAlign: 'center' },
  routePill: { marginTop: 12, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  route: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  countdownLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, marginTop: 24 },
  countdown: { fontSize: 34, lineHeight: 41, fontWeight: '600', marginTop: 2 },
  checkIn: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 12 },
  help: { fontSize: 12, lineHeight: 17, marginTop: 14 },
});
