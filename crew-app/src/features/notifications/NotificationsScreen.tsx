// Alerts tab — crew-app notification history + open FDP-discretion decisions.
//
// Covers two of the crew-app integration items:
//   • item 3 — a durable place to read notifications and scroll back through
//     history (flight_change / fdp_discretion / fdp_update).
//   • item 4 — for each open discretion, the scheduled vs actual timing, the
//     original (planned) vs latest (actual) FDP, and the two captain options
//     Accept / Reject. The decision is sent back to the crew-controller project.
import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';

import {useAppDispatch, useAppSelector} from '../../store';
import {colors, font, space, radius, cardBorder} from '../../theme';
import type {DiscretionRequest} from './notificationsApi';
import {decideDiscretion, loadNotifications, markNotificationReadThunk} from './notificationsSlice';

// "2026-08-05T00:50Z" / "2026-08-05T00:50:00" → "05 Aug 00:50z"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtUtc(value?: string | null): string {
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return value;
  const [, , month, day, hour, minute] = m;
  return `${day} ${MONTHS[Number(month) - 1]} ${hour}${minute}z`;
}

function fmtMin(v?: number | null): string {
  if (v == null) return '—';
  const h = Math.floor(v / 60);
  const mm = v % 60;
  return `${h}h${String(mm).padStart(2, '0')} (${v}m)`;
}

function parseUtcMinute(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isFinite(ms) ? Math.round(ms / 60000) : null;
}

function delayMinutes(d: DiscretionRequest): number | null {
  const sch = parseUtcMinute(d.schDep);
  const act = parseUtcMinute(d.actDep);
  if (sch == null || act == null) return null;
  return Math.max(act - sch, 0);
}

function fdpDeltaText(d: DiscretionRequest): string {
  return `FDP ${fmtMin(d.plannedFdpMin)} → ${fmtMin(d.actualFdpMin)}`;
}

function NotifTypeTag({type}: {type: string}) {
  const label =
    type === 'flight_change'
      ? 'FLIGHT'
      : type === 'fdp_discretion'
        ? 'FDP'
        : type === 'fdp_update'
          ? 'UPDATE'
          : 'INFO';
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const {notifications, openDiscretions, status, error, decidingId} = useAppSelector(
    s => s.notifications,
  );
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications(dispatch);
    setRefreshing(false);
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(dispatch);
    }, [dispatch]),
  );

  const onDecide = useCallback(
    (d: DiscretionRequest, decision: 'accept' | 'reject') => {
      const verb = decision === 'accept' ? 'Accept' : 'Reject';
      Alert.alert(
        `${verb} FDP discretion?`,
        decision === 'accept'
          ? `Approve a ${d.extensionRequestedMin}-min extension for duty ${d.dutyId}.`
          : `Decline the extension for duty ${d.dutyId}.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: verb,
            style: decision === 'reject' ? 'destructive' : 'default',
            onPress: () => {
              decideDiscretion(dispatch, {discretionId: d.discretionId, decision})
                .then(res =>
                  Alert.alert('Decision sent', `FDP discretion ${res.state}.`),
                )
                .catch(e =>
                  Alert.alert(
                    'Unable to send decision',
                    e instanceof Error ? e.message : 'Try again.',
                  ),
                );
            },
          },
        ],
      );
    },
    [dispatch],
  );

  return (
    <ScrollView
      testID="notifications-screen"
      style={styles.screen}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + space.lg16}]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={styles.h1}>Alerts</Text>

      {status === 'loading' && notifications.length === 0 && openDiscretions.length === 0 && (
        <ActivityIndicator testID="notifications-loading" color={colors.primary} style={{marginTop: space.xl24}} />
      )}

      {status === 'error' && (
        <View style={styles.errorBox} testID="notifications-error">
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh} testID="btn-retry">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Open FDP-discretion decisions (item 4) ── */}
      {openDiscretions.length > 0 && (
        <>
          <Text style={styles.overline}>ACTION REQUIRED</Text>
          {openDiscretions.map(d => {
            const deciding = decidingId === d.discretionId;
            return (
              <View key={d.discretionId} style={styles.discCard} testID="discretion-card">
                <View style={styles.rowBetween}>
                  <Text style={styles.discTitle}>FDP discretion · {d.dutyId}</Text>
                  <Text style={styles.extBadge}>+{d.extensionRequestedMin}m</Text>
                </View>

                <Text style={styles.discSummary}>
                  Flight delayed {delayMinutes(d) ?? '—'} min · {fdpDeltaText(d)}
                </Text>

                <View style={styles.grid}>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridHead}>Scheduled</Text>
                    <Text style={styles.gridVal}>{fmtUtc(d.schDep)} → {fmtUtc(d.schArv)}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridHead}>Actual</Text>
                    <Text style={[styles.gridVal, styles.actual]}>{fmtUtc(d.actDep)} → {fmtUtc(d.actArv)}</Text>
                  </View>
                </View>

                <View style={styles.grid}>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridHead}>Original FDP</Text>
                    <Text style={styles.gridVal}>{fmtMin(d.plannedFdpMin)}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={styles.gridHead}>Latest FDP</Text>
                    <Text style={[styles.gridVal, styles.actual]} testID="disc-latest-fdp">{fmtMin(d.actualFdpMin)}</Text>
                  </View>
                </View>
                <Text style={styles.limitLine}>
                  Plan limit {fmtMin(d.limitMin)} · exceed by {Math.max((d.actualFdpMin ?? 0) - (d.limitMin ?? 0), 0)}m
                </Text>
                <Text style={styles.choiceLine}>
                  Accept or reject {d.extensionRequestedMin} min FDP discretion.
                </Text>

                {deciding ? (
                  <ActivityIndicator color={colors.primary} style={{marginTop: space.md12}} />
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      testID="btn-reject"
                      onPress={() => onDecide(d, 'reject')}>
                      <Text style={styles.btnRejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnAccept]}
                      testID="btn-accept"
                      onPress={() => onDecide(d, 'accept')}>
                      <Text style={styles.btnAcceptText}>Accept +{d.extensionRequestedMin}m</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ── Notification history (item 3) ── */}
      <Text style={styles.overline}>NOTIFICATIONS</Text>
      {notifications.length === 0 && status === 'ready' && (
        <Text style={styles.empty} testID="notifications-empty">No notifications yet.</Text>
      )}
      {[...notifications].reverse().map(n => (
        <TouchableOpacity
          key={n.notifId}
          style={[styles.notifRow, n.status === 'read' && styles.notifRead]}
          testID="notif-row"
          onPress={() =>
            n.status !== 'read' && markNotificationReadThunk(dispatch, {notifId: n.notifId})
          }>
          <View style={styles.rowBetween}>
            <NotifTypeTag type={n.type} />
            <Text style={styles.notifTime}>{fmtUtc(n.createdUtc)}</Text>
          </View>
          <Text style={styles.notifTitle}>{n.title}</Text>
          <Text style={styles.notifBody}>{n.body}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  content: {paddingHorizontal: space.lg16, paddingBottom: space.xxl32},
  h1: {...font.h1, color: colors.ink, marginBottom: space.md12},
  overline: {...font.overline, color: colors.muted, marginTop: space.xl24, marginBottom: space.sm8},
  empty: {...font.body, color: colors.muted, marginTop: space.sm8},

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md12,
    marginTop: space.md12,
  },
  errorText: {...font.body, color: colors.ink},
  retry: {...font.bodyStrong, color: colors.primary, marginTop: space.sm8},

  discCard: {
    backgroundColor: colors.navBar,
    borderRadius: radius.md,
    padding: space.lg16,
    marginBottom: space.md12,
    ...cardBorder,
  },
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  discTitle: {...font.title, color: colors.ink},
  extBadge: {...font.caption, color: colors.onPrimary, backgroundColor: colors.primary, paddingHorizontal: space.sm8, paddingVertical: 2, borderRadius: radius.round, overflow: 'hidden'},
  discSummary: {...font.bodyStrong, color: colors.ink, marginTop: space.md12},

  grid: {flexDirection: 'row', marginTop: space.md12},
  gridCol: {flex: 1},
  gridHead: {...font.caption, color: colors.muted},
  gridVal: {...font.bodyStrong, color: colors.ink, marginTop: 2},
  actual: {color: colors.accent},
  limitLine: {...font.sub, color: colors.inkSoft, marginTop: space.md12},
  choiceLine: {...font.body, color: colors.ink, marginTop: space.sm8},

  actions: {flexDirection: 'row', marginTop: space.lg16, gap: space.md12},
  btn: {flex: 1, paddingVertical: space.md12, borderRadius: radius.sm, alignItems: 'center'},
  btnAccept: {backgroundColor: colors.primary},
  btnAcceptText: {...font.bodyStrong, color: colors.onPrimary},
  btnReject: {backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder},
  btnRejectText: {...font.bodyStrong, color: colors.ink},

  notifRow: {
    backgroundColor: colors.navBar,
    borderRadius: radius.op,
    padding: space.md12,
    marginBottom: space.sm8,
    ...cardBorder,
  },
  notifRead: {opacity: 0.55},
  notifTime: {...font.caption, color: colors.muted},
  notifTitle: {...font.bodyStrong, color: colors.ink, marginTop: space.xs4},
  notifBody: {...font.sub, color: colors.inkSoft, marginTop: 2},
  tag: {backgroundColor: colors.illoFill, borderRadius: radius.round, paddingHorizontal: space.sm8, paddingVertical: 2},
  tagText: {...font.caption, color: colors.primary},
});
