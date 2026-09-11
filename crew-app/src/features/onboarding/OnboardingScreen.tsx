import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
// ─── Onboarding carousel (placeholder) ───────────────────────────────────────
// Mirrors lib/features/onboarding. 3-screen intro carousel. Not part of the
// current login-first flow (doc/App Flow Ver1) — kept for reference.

const SLIDES = [
  { emoji: '🛫', title: 'Your roster, unified', body: 'Flights, layovers, and standby — all in one timeline.' },
  { emoji: '🏨', title: 'Smarter layovers', body: 'Hotel-anchored tips and crew favourites in every city.' },
  { emoji: '🧳', title: 'Personal travel too', body: 'Captured bookings sit right alongside your duties.' },
];

type Props = { navigation: { replace: (route: string) => void } };

export function OnboardingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      navigation.replace('Login');
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      <StatusBar barStyle="light-content" backgroundColor="#7b4fb8" />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}>
        {SLIDES.map(s => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.85}>
          <Text style={styles.buttonText}>
            {index === SLIDES.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7b4fb8' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 80, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 16, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 23 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#fff', width: 20 },
  footer: { padding: 24, alignItems: 'center', gap: 16 },
  button: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: { color: '#7b4fb8', fontSize: 16, fontWeight: '700' },
  skip: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});
