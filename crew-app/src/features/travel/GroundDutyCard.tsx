// ─── Ground-duty card ─────────────────────────────────────────────────────────
// Distinct card for non-flight roster duties (days off, leave, training, sim,
// standby, meetings, deadhead, reserve). Rendered interleaved with the flight
// trip cards in My Trips, ordered chronologically. Unlike the flight card it has
// no DEP→ARR route — it shows the duty kind, its time window (or "All day"), and
// any extra detail the portal exposes (sim session code, deadhead flight no.).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import { formatLegTime } from '../settings/timeFormat';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { CATEGORY_META, type DutyCategory, type GroundDuty } from '../roster/dutyDisplay';
import { colors, font, space, radius, cardBorder } from '../../theme';

// ─── Per-category glyph ───────────────────────────────────────────────────────
function DutyIcon({ category, color }: { category: DutyCategory; color: string }) {
  const s = 18;
  switch (category) {
    case 'off': // moon
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" fill={color} />
        </Svg>
      );
    case 'leave': // sun
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={4.2} fill={color} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
            const r = (a * Math.PI) / 180;
            const x1 = 12 + Math.cos(r) * 7;
            const y1 = 12 + Math.sin(r) * 7;
            const x2 = 12 + Math.cos(r) * 9.5;
            const y2 = 12 + Math.sin(r) * 9.5;
            return <Line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeLinecap="round" />;
          })}
        </Svg>
      );
    case 'training': // graduation cap
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M12 4 2 9l10 5 8-4v5" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <Path d="M6 12.5V16c0 1.3 2.7 2.5 6 2.5s6-1.2 6-2.5v-3.5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'standby': // bell
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <Path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case 'meeting': // two people
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={9} cy={8} r={3} fill="none" stroke={color} strokeWidth={2} />
          <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Path d="M16 6.2A3 3 0 0 1 18 12M17 14.3c2.4.5 4 2.4 4 4.7" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case 'reserve': // bookmark
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      );
    case 'deadhead': // plane
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill={color} />
        </Svg>
      );
    default: // generic calendar
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Rect x={3} y={5} width={18} height={16} rx={2} fill="none" stroke={color} strokeWidth={2} />
          <Line x1={3} y1={9} x2={21} y2={9} stroke={color} strokeWidth={2} />
        </Svg>
      );
  }
}

// "DD MMM HH:MM" → "DD MMM" (drop the time, for all-day duties).
function datePart(label: string): string {
  const m = label.match(/^(\d{1,2}\s+[A-Za-z]{3})/);
  return m ? m[1] : label;
}

export const GroundDutyCard = React.memo(function GroundDutyCard({
  duty,
  mode,
  baseTz,
  alarmHhmm,
  onToggleAlarm,
}: {
  duty: GroundDuty;
  mode: TimeZoneMode;
  baseTz: string;
  /** HH:MM of the scheduled alarm, null = muted, undefined = no alarm concept for this card. */
  alarmHhmm?: string | null;
  onToggleAlarm?: () => void;
}) {
  const meta = CATEGORY_META[duty.category];
  const startLabel = formatLegTime({
    flightDateUTC: duty.startRosterUTC,
    localTime: duty.localStart,
    mode,
    baseTz,
  });
  const endLabel = formatLegTime({
    flightDateUTC: duty.endRosterUTC,
    localTime: duty.localEnd,
    mode,
    baseTz,
  });

  const timeText = duty.allDay
    ? `All day · ${datePart(startLabel)}`
    : `${startLabel} → ${endLabel}`;

  // Avoid redundancy: the badge already names the category. Prefer the training
  // course description as the title when present (e.g. "CA FIRST AID RECURRENT"),
  // else the duty label. Only show the title when it adds information beyond the
  // badge, and only show the right-hand code chip when it differs from the badge
  // label (e.g. "BLOCK" under "Reserve", "SIM" under "Training") — hide it when
  // it's the same word (e.g. "MEETING" under "Meeting").
  const tr = duty.training;
  const titleText = (tr?.courseDesc || duty.label).trim();
  const badgeKey = meta.label.trim().toUpperCase();
  const showTitle = titleText.toUpperCase() !== badgeKey;
  const showCode = duty.code.trim().toUpperCase() !== badgeKey;

  // Course detail rows (this crew's own training info — no participant list).
  const trainingRows: Array<[string, string]> = tr
    ? ([
        ['Course', tr.courseName],
        ['Role', tr.role],
        ['Location', tr.location],
        ['Device', tr.device],
        ['Type', tr.courseType],
      ].filter(([, v]) => v != null && v !== '') as Array<[string, string]>)
    : [];

  return (
    <View style={[styles.card, { borderLeftColor: meta.accent }]} testID="ground-duty-card">
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: meta.tint }]}>
          <DutyIcon category={duty.category} color={meta.accent} />
          <Text style={[styles.badgeText, { color: meta.accent }]}>{meta.label}</Text>
        </View>
        <View style={styles.headerRight}>
          {showCode && (
            <View style={styles.codeChip}>
              <Text style={styles.codeText}>{duty.code}</Text>
            </View>
          )}
          {alarmHhmm !== undefined && (
            <TouchableOpacity
              style={styles.alarmChip}
              activeOpacity={0.7}
              onPress={onToggleAlarm}
              testID="meeting-alarm-toggle">
              <AlarmBellIcon muted={alarmHhmm === null} />
              <Text style={[styles.alarmText, alarmHhmm === null && styles.alarmTextMuted]}>
                {alarmHhmm !== null ? alarmHhmm : 'Off'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showTitle && (
        <Text style={[styles.title, tr ? styles.titleCourse : null]}>{titleText}</Text>
      )}

      <View style={[styles.timeRow, !showTitle && styles.timeRowSpaced]}>
        <Text style={styles.timeText}>{timeText}</Text>
      </View>

      {trainingRows.length > 0 ? (
        <View style={styles.trainingBlock}>
          {trainingRows.map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : duty.detail != null ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>
            {duty.category === 'training' ? 'Session' : 'Flight'}
          </Text>
          <Text style={styles.detailValue}>{duty.detail}</Text>
        </View>
      ) : null}

      {duty.joinUrl != null && (
        <TouchableOpacity
          style={styles.joinButton}
          activeOpacity={0.85}
          onPress={() => Linking.openURL(duty.joinUrl!).catch(() => {})}
          testID="join-meeting">
          <VideoIcon color={colors.onPrimary} />
          <Text style={styles.joinText}>Join meeting</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// Video-camera glyph for the online-meeting "Join" button (nav-bar outline style).
function VideoIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={3} y={6} width={12} height={12} rx={2.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M15 10.5 21 7v10l-6-3.5z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

// Bell glyph for the per-meeting alarm toggle. Muted = bell with a slash.
function AlarmBellIcon({ muted }: { muted: boolean }) {
  const c = muted ? colors.faint : colors.accent;
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" />
      {muted && <Line x1={3} y1={3} x2={21} y2={21} stroke={c} strokeWidth={2} strokeLinecap="round" />}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    marginHorizontal: space.lg16,
    marginTop: space.md12,
    borderRadius: radius.op,
    borderLeftWidth: 4,
    padding: space.lg16,
    ...cardBorder,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs4,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  codeChip: {
    backgroundColor: colors.tintBgSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm8,
    paddingVertical: 4,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },

  // Short duty labels (e.g. "Day Off", "Office Duty") read like a heading.
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: space.md12 },
  // A training course description is a full sentence — give it a calmer, more
  // proportioned weight/size so it doesn't shout over the detail rows.
  titleCourse: { fontSize: 15, fontWeight: '700', lineHeight: 20, letterSpacing: 0.1 },

  timeRow: { marginTop: space.xs4 },
  // When the big title is hidden, the time sits directly under the badge row and
  // needs the larger gap the title would otherwise have provided.
  timeRowSpaced: { marginTop: space.md12 },
  timeText: { ...font.sub, color: colors.muted, fontWeight: '600' },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm8,
    marginTop: space.md12,
    paddingTop: space.md12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  detailLabel: { fontSize: 11, fontWeight: '700', color: colors.faint, letterSpacing: 0.5, textTransform: 'uppercase' },
  detailValue: { ...font.sub, color: colors.ink, fontWeight: '700', flex: 1 },

  // Training course detail (TRG/SIM): a small key/value table under the time.
  // Calmer than the title: labels are quiet uppercase captions, values are
  // medium-weight ink so the course title (700) stays the card's focal point.
  trainingBlock: {
    marginTop: space.md12,
    paddingTop: space.md12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    width: 82,
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  infoValue: { ...font.sub, color: colors.ink, fontWeight: '600', flex: 1 },

  headerRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs4 },

  // Per-meeting alarm chip — sits in the header row after the badge.
  alarmChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
  alarmText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  alarmTextMuted: { color: colors.faint },

  // Online-meeting "Join" button — the one accent (purple), full-width pill.
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm8,
    marginTop: space.md12,
    paddingVertical: space.md12,
    borderRadius: radius.op,
    backgroundColor: colors.accent,
  },
  joinText: { ...font.sub, color: colors.onPrimary, fontWeight: '700' },
});
