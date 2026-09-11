// ─── Trip Trade · Page 1 — My Duty ────────────────────────────────────────────
// Replaces the old "Sign On" tab. Lists the crew's ACTUAL captured duties (TG or
// PR crew portal), lets them publish all / individually, and attach a desired-
// duty "trade" to each. Dateless generic wants float to the top; date-specific
// trades render inline. Follows Dev reference snapshots 1 & 2.

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store';
import { colors, font, radius, space, shadow } from '../../theme';
import {
  publishAllDuties, toggleDutyPublished, addGenericWant, removeGenericWant,
  setDutyTrade, clearDutyTrade,
} from './tripTradeSlice';
import {
  allPublished, swappableCount, mergeOverlay, tradeKind, kindLabel,
  type Trade, type TradeDuty, type TradeKind,
} from './tripTradeModel';
import { dutiesFromTrips } from './tripTradeSource';
import { ListIcon, PlusIcon, ArrowUpIcon, CalendarIcon, WantIcon } from './TripTradeIcons';

const track = { true: colors.primary, false: colors.neutralWeak };

export function MyDutyScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const trips = useAppSelector(s => s.trips.trips);
  const crewId = useAppSelector(s => s.auth.crewId);
  const airline = useAppSelector(s => s.auth.airline);
  const overlay = useAppSelector(s => s.tripTrade);

  // Real roster → duty cards, with the crew's publish/trade overlay applied.
  const duties = React.useMemo(
    () => mergeOverlay(dutiesFromTrips(trips, crewId), overlay),
    [trips, crewId, overlay],
  );
  const genericWants = overlay.genericWants;
  const masterOn = allPublished(duties);
  const monthTitle = monthHeading(duties);

  const onAddGenericWant = () => {
    Alert.prompt?.(
      'Add a preference',
      'What are you looking for? (e.g. FRA layover, any Japan trip)',
      text => {
        const title = (text ?? '').trim();
        if (!title) { return; }
        dispatch(addGenericWant({
          id: `g-${title}-${duties.length}`, wantsExactDuty: false, title, chips: [title], icon: 'target',
        }));
      },
    );
  };

  const onRemoveGenericWant = (want: Trade) => {
    Alert.alert('Remove preference', `Remove “${want.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch(removeGenericWant(want.id)) },
    ]);
  };

  const onAddDutyTrade = (duty: TradeDuty) => {
    Alert.prompt?.(
      `What do you want for ${duty.dayNum} ${duty.monthLabel}?`,
      'Describe the duty you want in return (e.g. check-in after 13:00, ≥24h layover).',
      text => {
        const title = (text ?? '').trim();
        if (!title) { return; }
        dispatch(setDutyTrade(duty.id, {
          id: `t-${duty.id}`, date: duty.date, wantsExactDuty: false,
          title, chips: [`${duty.dayNum} ${duty.monthLabel}`, 'Any duty', title],
        }));
      },
    );
  };

  const onEditDutyTrade = (duty: TradeDuty) => {
    Alert.alert('Trade', duty.trade?.title ?? '', [
      { text: 'Close', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => dispatch(clearDutyTrade(duty.id)) },
    ]);
  };

  const tradeNoById = new Map<string, number>();
  duties.filter(d => d.trade).forEach((d, i) => tradeNoById.set(d.id, i + 1));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.crumb}>
          Trip Trade{airline ? ` · ${airline}` : ''}{crewId ? ` · ${crewId}` : ''}
        </Text>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>My Duty</Text>
          <View style={styles.headerIcon}><ListIcon color={colors.onPrimary} size={18} /></View>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Publish all */}
        <View style={styles.bulk}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulkTitle}>Publish all duties</Text>
            <Text style={styles.bulkSub}>unlock every duty for swap</Text>
          </View>
          <Switch
            value={masterOn}
            onValueChange={v => dispatch(publishAllDuties(duties.map(d => d.id), v))}
            disabled={duties.length === 0}
            trackColor={track}
            thumbColor={colors.white}
            ios_backgroundColor={track.false}
            testID="publish-all"
          />
        </View>

        {/* Generic wants */}
        <SectionLabel icon={<ArrowUpIcon color={colors.muted} size={13} />} text="I'm looking for · any date" />
        {genericWants.map(w => (
          <TouchableOpacity key={w.id} activeOpacity={0.8} onLongPress={() => onRemoveGenericWant(w)} style={styles.genWant}>
            <WantIcon icon={w.icon} color={colors.accent} size={16} />
            <Text style={styles.genWantText} numberOfLines={1}>{w.title}</Text>
            <KindBadge kind="generic" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addRow} onPress={onAddGenericWant} activeOpacity={0.8} testID="add-generic-want">
          <PlusIcon color={colors.primary} size={15} />
          <Text style={styles.addRowText}>Add a general preference</Text>
        </TouchableOpacity>

        {/* Duties from the real roster */}
        <View style={styles.monthHead}>
          <SectionLabel icon={<CalendarIcon color={colors.muted} size={13} />} text={monthTitle} flush />
          {duties.length > 0 && (
            <Text style={styles.count}>{swappableCount(duties)} swappable {duties.length === 1 ? 'duty' : 'duties'}</Text>
          )}
        </View>

        {duties.length === 0 ? (
          <View style={styles.empty}>
            <CalendarIcon color={colors.faint} size={30} />
            <Text style={styles.emptyTitle}>No duties yet</Text>
            <Text style={styles.emptySub}>
              Sign in to your {airline || 'crew'} portal to load your roster — your duties will appear here to publish and swap.
            </Text>
          </View>
        ) : (
          duties.map(duty => (
            <DutyCard
              key={duty.id}
              duty={duty}
              tradeNo={tradeNoById.get(duty.id)}
              onTogglePublish={() => dispatch(toggleDutyPublished(duty.id, duty.published))}
              onAddTrade={() => onAddDutyTrade(duty)}
              onEditTrade={() => onEditDutyTrade(duty)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** "AUGUST · MY DUTIES" when the roster is one month, else "MY DUTIES". */
function monthHeading(duties: TradeDuty[]): string {
  const months = new Set(duties.map(d => d.monthLabel));
  if (months.size === 1) {
    return `${[...months][0].toUpperCase()} · my duties`;
  }
  return 'my duties';
}

// ─── Duty card ────────────────────────────────────────────────────────────────
function DutyCard({
  duty, tradeNo, onTogglePublish, onAddTrade, onEditTrade,
}: {
  duty: TradeDuty;
  tradeNo?: number;
  onTogglePublish: () => void;
  onAddTrade: () => void;
  onEditTrade: () => void;
}) {
  const { trade } = duty;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>{duty.weekday} {duty.dayNum} {duty.monthLabel.toUpperCase()} · CURRENT</Text>
          <Text style={styles.pairing}>
            {duty.pairing}
            <Text style={styles.pairingRest}>{duty.dest ? ` · ${duty.dest}` : ''} · {duty.durationDays} {duty.durationDays === 1 ? 'day' : 'days'}</Text>
          </Text>
          <Text style={styles.reportLine}>
            {duty.report ? `Report ${duty.report}` : 'Report —'}{duty.fleet ? ` · ${duty.fleet}` : ''}
          </Text>
        </View>
        <Switch
          value={duty.published}
          onValueChange={onTogglePublish}
          trackColor={track}
          thumbColor={colors.white}
          ios_backgroundColor={track.false}
          testID={`publish-${duty.id}`}
        />
      </View>

      {trade ? (
        <TouchableOpacity activeOpacity={0.8} onPress={onEditTrade}>
          <View style={styles.divider} />
          <Text style={styles.tradeHead}>{tradeNo ? `Trade #${tradeNo} · ` : ''}{kindLabel(tradeKind(trade))}</Text>
          <Text style={styles.tradeTitle}>{trade.title}</Text>
          <ChipRow chips={trade.chips} />
        </TouchableOpacity>
      ) : duty.published ? (
        <TouchableOpacity style={styles.addTrade} onPress={onAddTrade} activeOpacity={0.8}>
          <PlusIcon color={colors.muted} size={14} />
          <Text style={styles.addTradeText}>Add what you want for this date…</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.privateNote}>Private · not published</Text>
      )}
    </View>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────
function SectionLabel({ icon, text, flush }: { icon: React.ReactNode; text: string; flush?: boolean }) {
  return (
    <View style={[styles.sectionLabel, flush && { marginBottom: 0 }]}>
      {icon}
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  );
}

function ChipRow({ chips }: { chips: string[] }) {
  return (
    <View style={styles.chipRow}>
      {chips.map((c, i) => (
        <View key={i} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
      ))}
    </View>
  );
}

function KindBadge({ kind }: { kind: TradeKind }) {
  const boxStyle = kind === 'specific' ? styles.badgeSpecific : kind === 'hybrid' ? styles.badgeHybrid : styles.badgeGeneric;
  const txtStyle = kind === 'specific' ? styles.badgeTextSpecific : kind === 'hybrid' ? styles.badgeTextHybrid : styles.badgeTextGeneric;
  return (
    <View style={[styles.badge, boxStyle]}><Text style={[styles.badgeText, txtStyle]}>{kindLabel(kind)}</Text></View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { backgroundColor: colors.primary, paddingHorizontal: space.lg16, paddingBottom: 14 },
  crumb: { color: colors.onPrimaryMuted, fontSize: 12, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  headerTitle: { color: colors.onPrimary, fontSize: 26, fontWeight: '800', letterSpacing: 0.2 },
  headerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.onPrimaryChip, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1 },
  bodyContent: { padding: space.lg16, paddingBottom: 40 },

  bulk: {
    flexDirection: 'row', alignItems: 'center', gap: space.md12,
    backgroundColor: colors.tintBg, borderWidth: 1, borderColor: colors.tintBorder,
    borderRadius: radius.md, paddingHorizontal: space.lg16, paddingVertical: 14, marginBottom: space.lg16,
  },
  bulkTitle: { ...font.bodyStrong, color: colors.ink },
  bulkSub: { fontSize: 12, color: colors.muted, marginTop: 1 },

  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm8, marginBottom: space.md12, marginLeft: 2 },
  sectionLabelText: { ...font.overline, color: colors.muted, textTransform: 'uppercase' },

  genWant: {
    flexDirection: 'row', alignItems: 'center', gap: space.md12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.tintBorder,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: space.sm8, ...shadow,
  },
  genWantText: { flex: 1, ...font.bodyStrong, color: colors.ink },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.tintBorder, borderStyle: 'dashed',
    borderRadius: radius.md, backgroundColor: colors.card,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: space.sm8,
  },
  addRowText: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg16, marginBottom: space.md12 },
  count: { fontSize: 12, color: colors.muted, fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: space.xl24, gap: 10 },
  emptyTitle: { ...font.h2, color: colors.ink },
  emptySub: { ...font.body, color: colors.muted, textAlign: 'center' },

  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
    borderRadius: radius.lg, padding: 14, marginBottom: space.md12, ...shadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md12 },
  overline: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.muted },
  pairing: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 3 },
  pairingRest: { fontSize: 15, fontWeight: '700', color: colors.ink },
  reportLine: { fontSize: 13, color: colors.inkSoft, marginTop: 3 },

  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  tradeHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase' },
  tradeTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: colors.tintBorder, backgroundColor: colors.tintBg, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  addTrade: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    borderWidth: 1, borderColor: colors.hairline, borderStyle: 'dashed',
    borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 10,
  },
  addTradeText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  privateNote: { fontSize: 13, color: colors.muted, fontWeight: '600', marginTop: 12 },

  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeSpecific: { backgroundColor: colors.primary },
  badgeTextSpecific: { color: colors.onPrimary },
  badgeHybrid: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.tintBorder },
  badgeTextHybrid: { color: colors.primary },
  badgeGeneric: { backgroundColor: colors.offFill, borderWidth: 1, borderColor: colors.hairline },
  badgeTextGeneric: { color: colors.muted },
});
