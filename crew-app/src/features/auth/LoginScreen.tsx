import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import {
  AIRLINES,
  DEFAULT_AIRLINE,
  TEST_CREW_ID,
  TEST_CREW_PW,
  airlineByCode,
  crewIdKeyboardType,
  loginRouteForAirline,
  prefillForAirline,
} from './airlines';
import type { Airline } from './airlines';
import { colors, font, space, radius } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [airline, setAirline] = useState(DEFAULT_AIRLINE);
  const [crewId, setCrewId] = useState(TEST_CREW_ID);
  const [password, setPassword] = useState(TEST_CREW_PW);
  const [keepLogin, setKeepLogin] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const onLogin = () => {
    const selected = airlineByCode(airline);
    const destination = loginRouteForAirline(airline);
    if (!destination) {
      Alert.alert(`${selected.name} not available yet`, 'This airline is not connected yet.');
      return;
    }
    if (!crewId.trim() || !password) {
      Alert.alert('Missing details', 'Enter your Crew ID and password.');
      return;
    }
    const params = {
      airline,
      crewId: crewId.trim().toUpperCase(),
      password,
      keepLogin,
    };
    if (destination === 'EkRoster') {
      navigation.navigate('EkRoster', params);
    } else {
      navigation.navigate('Capture', params);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoCircle}>
              <Svg width={34} height={34} viewBox="0 0 24 24">
                <Path
                  d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"
                  fill={colors.white}
                />
              </Svg>
            </View>
            <Text style={styles.title}>R'Bot</Text>
            <Text style={styles.subtitle}>Travel With Love</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.label}>Airline</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
              testID="airline-dropdown">
              <View style={styles.dropdownCode}>
                <Text style={styles.dropdownCodeText}>{airlineByCode(airline).code}</Text>
              </View>
              <Text style={styles.dropdownText} numberOfLines={1}>
                {airlineByCode(airline).name}
              </Text>
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M7 10l5 5 5-5z" fill={colors.muted} />
              </Svg>
            </TouchableOpacity>

            <Text style={styles.label}>Crew ID</Text>
            <TextInput
              style={styles.input}
              value={crewId}
              onChangeText={setCrewId}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={crewIdKeyboardType(airline)}
              placeholder="Crew ID"
              placeholderTextColor={colors.faint}
              testID="crew-id"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={styles.pwInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Password"
                placeholderTextColor={colors.faint}
                testID="crew-pw"
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={10}>
                <Text style={styles.showPw}>{showPw ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.keepRow}
              onPress={() => setKeepLogin(v => !v)}
              activeOpacity={0.7}
              testID="keep-login">
              <View style={[styles.checkbox, keepLogin && styles.checkboxOn]}>
                {keepLogin && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={styles.keepText}>Keep me logged in</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginBtn} onPress={onLogin} testID="login-btn">
              <Text style={styles.loginBtnText}>Log in</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              You’ll sign in securely on {airlineByCode(airline).name}’s own crew portal.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AirlinePicker
        visible={pickerOpen}
        selected={airline}
        onSelect={code => {
          setAirline(code);
          setPickerOpen(false);
          const next = prefillForAirline(code, crewId, password);
          setCrewId(next.crewId);
          setPassword(next.password);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// Searchable, full-height airline picker. Scales to hundreds of carriers — the
// crew filters by code or name instead of scanning a row of chips.
function AirlinePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return AIRLINES;
    }
    return AIRLINES.filter(
      a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [query]);

  const renderItem = ({ item }: { item: Airline }) => {
    const active = item.code === selected;
    return (
      <TouchableOpacity
        style={styles.pickRow}
        onPress={() => onSelect(item.code)}
        testID={`airline-${item.code}`}>
        <View style={[styles.pickCode, active && styles.pickCodeActive]}>
          <Text style={[styles.pickCodeText, active && styles.pickCodeTextActive]}>
            {item.code}
          </Text>
        </View>
        <Text style={[styles.pickName, active && styles.pickNameActive]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.portalKind !== null ? <Text style={styles.pickReady}>● Live</Text> : null}
        {active ? <Text style={styles.pickCheck}>✓</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select airline</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} testID="airline-picker-close">
            <Text style={styles.sheetClose}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <Svg width={18} height={18} viewBox="0 0 24 24" style={{ marginRight: 8 }}>
            <Path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
              fill={colors.muted}
            />
          </Svg>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search code or name"
            placeholderTextColor={colors.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="airline-search"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <FlatList
          data={results}
          keyExtractor={a => a.code}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={
            <Text style={styles.pickEmpty}>No airline matches “{query}”.</Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, paddingBottom: space.xxl32 },

  hero: { alignItems: 'center', paddingTop: 36, paddingBottom: 28 },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.onPrimaryChip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg16,
  },
  title: { ...font.h1, color: colors.onPrimary, letterSpacing: 0.3 },
  subtitle: { ...font.body, color: colors.onPrimaryMuted, marginTop: 6 },

  card: {
    backgroundColor: colors.card,
    marginHorizontal: 18,
    borderRadius: radius.pill,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: space.sm8,
    marginTop: space.lg16,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.md12,
    paddingVertical: 11,
    gap: space.md12,
  },
  dropdownCode: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
  },
  dropdownCodeText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  dropdownText: { flex: 1, fontSize: 16, color: colors.ink, fontWeight: '600' },

  // ── Airline picker sheet ──
  sheet: { flex: 1, backgroundColor: colors.card },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl24,
    paddingVertical: space.lg16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  sheetTitle: { ...font.h2, color: colors.ink },
  sheetClose: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.md12,
    marginHorizontal: space.lg16,
    marginVertical: space.md12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 16, color: colors.ink },
  searchClear: { color: colors.faint, fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg16,
    paddingVertical: space.md12,
    gap: space.md12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  pickCode: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  pickCodeActive: { backgroundColor: colors.accent },
  pickCodeText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  pickCodeTextActive: { color: colors.onPrimary },
  pickName: { flex: 1, fontSize: 16, color: colors.ink, fontWeight: '500' },
  pickNameActive: { fontWeight: '800', color: colors.primary },
  pickReady: { fontSize: 11, fontWeight: '700', color: colors.accent },
  pickCheck: { fontSize: 16, fontWeight: '900', color: colors.accent },
  pickEmpty: { textAlign: 'center', color: colors.faint, marginTop: space.xxl32, fontSize: 14 },

  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.lg16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.lg16,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pwInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.ink },
  showPw: { color: colors.accent, fontWeight: '700', fontSize: 13 },

  keepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md12, marginTop: space.xl24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.tintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.onPrimary, fontSize: 14, fontWeight: '900' },
  keepText: { ...font.body, color: colors.ink, fontWeight: '600' },

  loginBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: space.lg16,
    alignItems: 'center',
    marginTop: space.xl24,
  },
  loginBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  hint: { fontSize: 11, color: colors.faint, textAlign: 'center', marginTop: space.lg16, lineHeight: 16 },
});
