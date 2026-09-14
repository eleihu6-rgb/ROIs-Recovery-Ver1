// Alerts — the crew's durable notification history + open FDP-discretion
// decisions.
//
// Rebuilt on the v2 surface (carrier palette, line icons, a back chevron) after
// Ryan's review of 2026-09-11: the pushed Alerts screen had no way back to Home,
// and the list was unstyled prose. A roster change now renders as BEFORE → AFTER
// so the crew compares the duty they lost with the duty they gained instead of
// reading a sentence. The restructuring is presentation-only: the feed, the read
// marking and the FDP decision flow are the same as before.
import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';

import {useAppDispatch, useAppSelector} from '../../store';
import {useCarrier, type CarrierPalette} from '../../theme/carrier';
import {GradientScreen} from '../../components/v2/GradientScreen';
import {Icon, type IconName} from '../../components/v2/icons';
import {AppDialog, type AppDialogTone} from '../../components/v2/AppDialog';
import {SectionLabel} from '../../components/v2/rows';
import type {DiscretionRequest} from './notificationsApi';
import {decideDiscretion, loadNotifications, markNotificationReadThunk} from './notificationsSlice';
import {DiscretionCard} from './DiscretionCard';
import {
  describeRosterChange,
  formatAfterDuty,
  formatDay,
  formatLegRoute,
  formatLegWindow,
  parseRosterChange,
  type RosterChange,
} from './rosterChange';

// "2026-08-05T00:50Z" / "2026-08-05T00:50:00" → "05 Aug 00:50z"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtUtc(value?: string | null): string {
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return value;
  const [, , month, day, hour, minute] = m;
  return `${day} ${MONTHS[Number(month) - 1]} ${hour}${minute}z`;
}

/** Line glyph per alert type — the same vocabulary the rest of the v2 surface uses. */
const ICON_BY_TYPE: Record<string, IconName> = {
  roster_change: 'swap',
  flight_change: 'plane',
  fdp_discretion: 'shield',
  fdp_update: 'clock',
  info: 'bell',
};

function typeLabel(type: string): string {
  return (
    type === 'roster_change'
      ? 'ROSTER'
      : type === 'flight_change'
        ? 'FLIGHT'
        : type === 'fdp_discretion'
          ? 'FDP'
          : type === 'fdp_update'
            ? 'UPDATE'
            : 'INFO'
  ).toString();
}

/** The BEFORE → AFTER block: what the crew had, what they have now. */
function RosterChangeBlock({
  change,
  palette,
  mode,
  baseTz,
}: {
  change: RosterChange;
  palette: CarrierPalette;
  mode: Parameters<typeof formatLegWindow>[1];
  baseTz: string;
}): React.JSX.Element {
  const beforeLines: string[] = [];
  for (const duty of change.before) {
    for (const leg of duty.legs) {
      beforeLines.push(formatLegRoute(leg));
      const window = formatLegWindow(leg, mode, baseTz);
      // Date + window only: the tail/fleet made the line wrap in a half-width
      // column, and the alert is about which duty changed, not which aircraft flew it.
      const meta = [formatDay(duty.date), window].filter(Boolean).join(' · ');
      if (meta) beforeLines.push(meta);
    }
  }
  const afterLines: string[] = [];
  for (const day of change.after) {
    afterLines.push(formatAfterDuty(day) || day.assignment);
    const meta = [formatDay(day.date), day.base].filter(Boolean).join(' · ');
    if (meta) afterLines.push(meta);
  }

  return (
    <View style={[styles.change, {borderColor: palette.cardLine}]}>
      <View style={styles.changeCol}>
        <View style={styles.changeHead}>
          <View style={[styles.changeDot, {backgroundColor: palette.cardSoft}]} />
          <Text style={[styles.changeLabel, {color: palette.cardSoft}]}>BEFORE</Text>
        </View>
        {beforeLines.map((line, i) => (
          <Text
            key={`b${i}`}
            style={[
              i % 2 === 0 ? styles.changeStrong : styles.changeMeta,
              {color: palette.cardSoft},
              i % 2 === 0 ? styles.changeStruck : null,
            ]}
            testID={i === 0 ? 'notif-change-before' : undefined}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.changeArrow}>
        <View style={[styles.arrowCircle, {backgroundColor: palette.frost}]}>
          {/* `chev` already points right — the two sides read left → right. */}
          <Icon name="chev" size={16} color={palette.cardInk} strokeWidth={2} />
        </View>
      </View>

      <View style={styles.changeCol}>
        <View style={styles.changeHead}>
          <View style={[styles.changeDot, {backgroundColor: palette.btn}]} />
          <Text style={[styles.changeLabel, {color: palette.btn}]}>AFTER</Text>
        </View>
        {afterLines.map((line, i) => (
          <Text
            key={`a${i}`}
            style={[
              i % 2 === 0 ? styles.changeStrong : styles.changeMeta,
              {color: i % 2 === 0 ? palette.btn : palette.cardSoft},
            ]}
            testID={i === 0 ? 'notif-change-after' : undefined}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function NotificationsScreen(): React.JSX.Element {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const {notifications, openDiscretions, status, error, decidingId} = useAppSelector(
    s => s.notifications,
  );
  const auth = useAppSelector(s => s.auth);
  const credentials = useMemo(() => ({ airline: auth.airline, crewId: auth.crewId ?? '', password: auth.password ?? '' }), [auth.airline, auth.crewId, auth.password]);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const [refreshing, setRefreshing] = useState(false);
  // One product pop-up (pop-up standard: status card, not a native alert).
  const [dialog, setDialog] = useState<{
    tone: AppDialogTone; title: string; message: string;
    cancelLabel?: string; confirmLabel: string; onConfirm?: () => void;
  } | null>(null);
  function closeDialog() {
    setDialog(null);
  }
  function confirmDialog() {
    const handler = dialog?.onConfirm;
    setDialog(null);
    handler?.();
  }

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications(dispatch, {credentials});
    setRefreshing(false);
  }, [dispatch, credentials]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(dispatch, {credentials});
    }, [dispatch, credentials]),
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
            .then(res => setDialog({tone: 'success', title: 'Decision sent', message: `FDP discretion ${res.state}.`, confirmLabel: 'Got it'}))
            .catch(e =>
              setDialog({
                tone: 'destructive',
                title: 'Unable to send decision',
                message: e instanceof Error ? e.message : 'Try again.',
                confirmLabel: 'Got it',
              }),
            );
        },
      });
    },
    [dispatch, credentials],
  );

  const unread = notifications.filter(n => n.status !== 'read').length;

  return (
    <GradientScreen palette={p} texture={false}>
      {/* A pushed screen needs its own way back — the dock is not on this route. */}
      <View style={[styles.head, {paddingTop: insets.top + 8}]}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="back"
          testID="alerts-back">
          <Icon name="back" size={24} color={p.ink} strokeWidth={1.8} />
        </Pressable>
        <Text style={[styles.title, {color: p.ink}]}>Alerts</Text>
        <View style={styles.iconBtn}>
          {unread > 0 ? (
            <View style={[styles.headBadge, {backgroundColor: p.frostStrong}]}>
              <Text style={[styles.headBadgeText, {color: p.ink}]}>{unread}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        testID="notifications-screen"
        style={styles.screen}
        contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 32}]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={p.ink}
          />
        }>
        {status === 'loading' && notifications.length === 0 && openDiscretions.length === 0 && (
          <ActivityIndicator
            testID="notifications-loading"
            color={p.ink}
            style={styles.spinner}
          />
        )}

        {status === 'error' && (
          <View style={[styles.errorBox, {backgroundColor: p.frost}]} testID="notifications-error">
            <Icon name="bell" size={20} color={p.ink} strokeWidth={1.7} />
            <Text style={[styles.errorText, {color: p.ink}]}>{error}</Text>
            <Pressable onPress={refresh} testID="btn-retry" hitSlop={8}>
              <Text style={[styles.retry, {color: p.ink}]}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* ── Open FDP-discretion decisions ── */}
        {openDiscretions.length > 0 && (
          <>
            <SectionLabel palette={p}>ACTION REQUIRED</SectionLabel>
            {openDiscretions.map(d => (
              <DiscretionCard
                key={d.discretionId}
                request={d}
                palette={p}
                deciding={decidingId === d.discretionId}
                onDecide={onDecide}
              />
            ))}
          </>
        )}

        {/* ── Alert history ── */}
        <SectionLabel palette={p}>NOTIFICATIONS</SectionLabel>
        {notifications.length === 0 && status === 'ready' && (
          <Text style={[styles.empty, {color: p.inkSoft}]} testID="notifications-empty">
            No notifications yet.
          </Text>
        )}
        {[...notifications].reverse().map(n => {
          const change = parseRosterChange(n.payload);
          const read = n.status === 'read';
          // The row is one accessible element, so it needs one sentence: the title
          // plus the spoken before/after (or the plain body for other alerts).
          const spoken = change
            ? describeRosterChange(change, mode, baseTz)
            : n.body;
          return (
            <Pressable
              key={n.notifId}
              style={[
                styles.card,
                {backgroundColor: p.cardSolid},
                read ? styles.cardRead : null,
              ]}
              testID="notif-row"
              accessibilityRole="button"
              accessibilityLabel={[n.title, spoken].filter(Boolean).join('. ')}
              onPress={() =>
                !read && markNotificationReadThunk(dispatch, {notifId: n.notifId, credentials})
              }>
              <View style={styles.rowBetween}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.chip, {backgroundColor: p.frost}]}>
                    <Icon
                      name={ICON_BY_TYPE[n.type] ?? 'bell'}
                      size={16}
                      color={p.cardInk}
                      strokeWidth={1.7}
                    />
                  </View>
                  <Text style={[styles.typeTag, {color: p.cardSoft}]}>{typeLabel(n.type)}</Text>
                  {!read ? <View style={[styles.unread, {backgroundColor: p.btn}]} /> : null}
                </View>
                <Text style={[styles.cardTime, {color: p.cardSoft}]}>{fmtUtc(n.createdUtc)}</Text>
              </View>

              <Text style={[styles.cardTitle, {color: p.cardInk}]}>{n.title}</Text>

              {change ? (
                <RosterChangeBlock change={change} palette={p} mode={mode} baseTz={baseTz} />
              ) : (
                <Text style={[styles.cardBody, {color: p.cardSoft}]}>{n.body}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <AppDialog
        visible={dialog !== null}
        onClose={closeDialog}
        onConfirm={confirmDialog}
        tone={dialog?.tone ?? 'neutral'}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        cancelLabel={dialog?.cancelLabel}
        confirmLabel={dialog?.confirmLabel}
        onCancel={closeDialog}
        testID="notifications-dialog"
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  title: {flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '600'},
  headBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBadgeText: {fontSize: 12, fontWeight: '700'},
  screen: {flex: 1},
  content: {paddingHorizontal: 22, paddingTop: 4},
  spinner: {marginTop: 24},
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
  },
  errorText: {flex: 1, fontSize: 13},
  retry: {fontSize: 13, fontWeight: '700'},
  empty: {fontSize: 14, marginTop: 6},

  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 4,
  },
  cardRead: {opacity: 0.68},
  rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  cardHeadLeft: {flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1},
  chip: {width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  typeTag: {fontSize: 10, fontWeight: '700', letterSpacing: 0.8},
  unread: {width: 7, height: 7, borderRadius: 4},
  cardTime: {fontSize: 11, fontWeight: '500'},
  cardTitle: {fontSize: 17, fontWeight: '600', marginTop: 10},
  cardBody: {fontSize: 13, lineHeight: 19, marginTop: 5},

  // BEFORE → AFTER
  change: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  changeCol: {flex: 1, gap: 2},
  changeHead: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6},
  changeDot: {width: 6, height: 6, borderRadius: 3},
  changeLabel: {fontSize: 10, fontWeight: '700', letterSpacing: 0.9},
  changeStrong: {fontSize: 14, fontWeight: '600'},
  changeMeta: {fontSize: 12, lineHeight: 16},
  changeStruck: {textDecorationLine: 'line-through'},
  changeArrow: {width: 44, alignItems: 'center', justifyContent: 'center'},
  arrowCircle: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},

  extBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: 12,
    paddingVertical: 10,
    gap: 12,
  },
  gridPlain: {flexDirection: 'row', paddingVertical: 10, gap: 12},
  gridCol: {flex: 1},
  gridHead: {fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 3},
  gridVal: {fontSize: 13, fontWeight: '600'},
  limitLine: {fontSize: 12, marginTop: 2},
  choiceLine: {fontSize: 13, fontWeight: '500', marginTop: 8},
  actions: {flexDirection: 'row', gap: 10, marginTop: 14},
  btn: {flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center'},
  btnGhost: {borderWidth: 1},
  btnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  btnGhostText: {fontSize: 14, fontWeight: '600'},

});
