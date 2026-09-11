// Test-alarm button with a 1-second countdown, isolated from ProfileScreen
// (enhance-Ver1 #5). Keeping the per-second tick state inside this memoized
// child means the surrounding profile content does not re-run every second.

import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, space, radius } from '../../../theme';
import { BellIcon } from '../../travel/components/TripIcons';

interface TestAlarmButtonProps {
  // Schedules the native test alarm and resolves with the epoch-ms fire time,
  // or null if it could not be scheduled (permission denied / unavailable).
  onSchedule: () => Promise<number | null>;
}

function TestAlarmButtonImpl({ onSchedule }: TestAlarmButtonProps) {
  const [ringAt, setRingAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const busyRef = useRef(false);

  // Tick once a second only while a countdown is active.
  useEffect(() => {
    if (ringAt == null) {
      return;
    }
    const iv = setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (t >= ringAt) {
        setRingAt(null);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [ringAt]);

  const remaining = ringAt != null ? Math.max(0, Math.ceil((ringAt - nowMs) / 1000)) : 0;
  const active = ringAt != null;

  const handlePress = async () => {
    if (busyRef.current || active) {
      return;
    }
    busyRef.current = true;
    try {
      const fireAt = await onSchedule();
      if (fireAt != null) {
        setNowMs(Date.now());
        setRingAt(fireAt);
      }
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.testBtn, active && styles.testBtnActive]}
      onPress={handlePress}
      disabled={active}
      activeOpacity={0.85}
      testID="test-alarm">
      <BellIcon color={colors.accent} size={16} />
      <Text style={styles.testBtnText}>
        {active
          ? `Ring a test alarm in 10 seconds (${remaining} seconds)`
          : 'Ring a test alarm in 10 seconds'}
      </Text>
    </TouchableOpacity>
  );
}

export const TestAlarmButton = React.memo(TestAlarmButtonImpl);

const styles = StyleSheet.create({
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm8,
    borderRadius: radius.md,
    paddingVertical: space.md12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  testBtnActive: { backgroundColor: colors.tintBg, borderColor: colors.primaryDisabled },
  testBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
