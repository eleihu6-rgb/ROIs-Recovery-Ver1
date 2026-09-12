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
import { useAppDispatch } from '../../store';
import { loginAsGuest, loginWithIdentity } from './authSlice';
import { SOCIAL_PROVIDERS, PROVIDER_LABELS } from './identity';
import type { SocialProvider } from './identity';
import {
  SocialAuthUnavailableError,
  isProviderConfigured,
  isSocialAuthCancel,
  signInWith,
} from './socialAuth';
import { ProviderGlyph } from './ProviderGlyph';
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
import { GradientScreen } from '../../components/v2/GradientScreen';
import { AltairMark } from '../../components/v2/BrandLogo';
import { Icon } from '../../components/v2/icons';
import type { IconName } from '../../components/v2/icons';
import { PALETTES } from '../../theme/carrier';

// v2 login palette: Altair sage/teal ground, white card, teal button.
const LOGIN = PALETTES.altair;

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const [airline, setAirline] = useState(DEFAULT_AIRLINE);
  // The form starts empty: the app no longer opens with a remembered/last login
  // pre-filled into the fields (Ryan, 2026-09-11).
  const [crewId, setCrewId] = useState('');
  const [password, setPassword] = useState('');
  const [keepLogin, setKeepLogin] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Which provider is mid-flow, so a second tap cannot start it twice.
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);

  // "Login as Guest": skip the airline portal entirely. The session is still a
  // real, persisted login, so everything that does not need a roster (alarms,
  // meetings/iOS calendar, time zone, Explore, R'Bot) works as usual.
  const onGuest = () => {
    dispatch(loginAsGuest({ keepLogin }));
  };

  // Continue with Google / Apple / Facebook. A build without the provider's SDK
  // or client id says exactly what is missing instead of pretending to sign in.
  const onSocial = async (provider: SocialProvider) => {
    if (socialBusy) {
      return;
    }
    setSocialBusy(provider);
    try {
      const profile = await signInWith(provider);
      await dispatch(loginWithIdentity(profile, { keepLogin }));
    } catch (error) {
      if (isSocialAuthCancel(error)) {
        return;
      }
      Alert.alert(
        error instanceof SocialAuthUnavailableError
          ? 'Not available yet'
          : `${PROVIDER_LABELS[provider]} sign-in failed`,
        error instanceof Error ? error.message : 'Try again.',
      );
    } finally {
      setSocialBusy(null);
    }
  };

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
    <GradientScreen palette={LOGIN}>
    <SafeAreaView style={styles.container} testID="login-screen">
      <StatusBar barStyle="light-content" backgroundColor={LOGIN.g1} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Hero */}
          {/* Hero — Altair mark + the product name (neutral brand before an airline is
              chosen). Ryan 2026-09-11: the app name sits under the logo, not the wordmark. */}
          <View style={styles.hero}>
            <AltairMark size={72} />
            <Text style={styles.appName}>ROIs Altair</Text>
            <Text style={styles.subtitle}>ALWAYS A WAY FORWARD</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* No "Airline" label: the value (code + carrier name) already says it. */}
            <FieldRow icon="globe">
              <TouchableOpacity
                style={styles.rowValueRow}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.7}
                testID="airline-dropdown">
                <View style={styles.dropdownCode}>
                  <Text style={styles.dropdownCodeText}>{airlineByCode(airline).code}</Text>
                </View>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {airlineByCode(airline).name}
                </Text>
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path d="M7 10l5 5 5-5z" fill={colors.muted} />
                </Svg>
              </TouchableOpacity>
            </FieldRow>

            {/* The field's own name IS the placeholder: a label above an empty
                box said the same thing twice and pushed the two fields apart
                (Ryan, 2026-09-11). */}
            <FieldRow icon="user">
              <TextInput
                style={styles.rowInput}
                value={crewId}
                onChangeText={setCrewId}
                placeholder="Crew ID"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={crewIdKeyboardType(airline)}
                testID="crew-id"
              />
            </FieldRow>

            <FieldRow icon="lock" last>
              <View style={styles.pwRow}>
                <TextInput
                  style={styles.rowInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="crew-pw"
                />
                <TouchableOpacity
                  onPress={() => setShowPw(v => !v)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                  testID="toggle-pw">
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={20} color={LOGIN.g1} />
                </TouchableOpacity>
              </View>
            </FieldRow>

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
              <Text style={styles.loginBtnText}>Login As Crew</Text>
            </TouchableOpacity>

            {/* Guest + social entry (Ryan 2026-09-12, per the reference crop):
                the Or rule and the provider marks sit right below Login As Crew,
                with the guest action — the way in without an airline account —
                last, wearing the SAME button as the crew login so the two read as
                a matched pair rather than a primary action and a stray outline. */}
            <View style={styles.orRow}>
              <View style={styles.orRule} />
              {/* Capital-O "Or", as the reference crop labels it. */}
              <Text style={styles.orText}>Or</Text>
              <View style={styles.orRule} />
            </View>

            <View style={styles.socialRow}>
              {SOCIAL_PROVIDERS.map(provider => {
                const configured = isProviderConfigured(provider);
                const label = PROVIDER_LABELS[provider];
                return (
                  <TouchableOpacity
                    key={provider}
                    style={styles.socialBtn}
                    onPress={() => onSocial(provider)}
                    disabled={socialBusy !== null}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      configured
                        ? `Continue with ${label}`
                        : `Continue with ${label} — not set up in this build`
                    }
                    testID={`social-${provider}`}>
                    <ProviderGlyph provider={provider} size={26} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, styles.guestBtnGap]}
              onPress={onGuest}
              activeOpacity={0.8}
              testID="guest-login">
              <Text style={styles.loginBtnText}>Login as Guest</Text>
            </TouchableOpacity>
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
    </GradientScreen>
  );
}

// One login field, drawn in the portal sign-in style Ryan referenced on 2026-09-11:
// leading glyph · hairline divider · the value line · hairline underline. The
// field's name is its placeholder, never a label above it (Ryan, 2026-09-11).
// Re-skinned in the Altair palette so it stays our own look.
function FieldRow({
  icon,
  last,
  children,
}: {
  icon: IconName;
  last?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      {/* Glyph + divider are centred on the value line. */}
      <View style={styles.fieldLine}>
        <View style={styles.fieldIcon}>
          <Icon name={icon} size={19} color={LOGIN.g2} />
        </View>
        <View style={styles.fieldSplit} />
        <View style={styles.fieldBody}>{children}</View>
      </View>
    </View>
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
      {/* The picker is the login page's own palette (altair sage) so choosing a
          carrier never drops the crew into the app-theme purple. */}
      <GradientScreen palette={LOGIN} style={styles.sheet}>
        <SafeAreaView style={styles.sheetInner}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: LOGIN.ink }]}>Select airline</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} testID="airline-picker-close">
              <Text style={[styles.sheetClose, { color: LOGIN.ink }]}>Done</Text>
            </TouchableOpacity>
          </View>
        <View style={styles.searchWrap}>
          <Svg width={18} height={18} viewBox="0 0 24 24" style={{ marginRight: 8 }}>
            <Path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
              fill={LOGIN.g1}
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
      </GradientScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  // Hero: logo, then the product name, then the spaced uppercase tagline.
  appName: { ...font.h1, color: colors.onPrimary, letterSpacing: 0.3, marginTop: 12 },
  subtitle: { fontSize: 10, fontWeight: '600', letterSpacing: 3.2, color: LOGIN.inkSoft, marginTop: 10 },

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
  // ── Field rows (portal sign-in style, Altair palette) ──
  field: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(30,61,56,.22)',
    paddingTop: space.md12,
    paddingBottom: 10,
  },
  fieldLast: { borderBottomWidth: 0, paddingBottom: space.md12 },
  fieldLine: { flexDirection: 'row', alignItems: 'center' },
  fieldIcon: { width: 34, alignItems: 'center' },
  fieldSplit: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: 'rgba(30,61,56,.22)',
    marginRight: 14,
  },
  fieldBody: { flex: 1, minWidth: 0 },

  rowValueRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm8, paddingTop: 3 },
  rowValue: { flex: 1, fontSize: 16, fontWeight: '600', color: LOGIN.g1 },
  dropdownCode: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(30,61,56,.10)',
    alignItems: 'center',
  },
  dropdownCodeText: { fontSize: 13, fontWeight: '800', color: LOGIN.g1 },
  rowInput: { flex: 1, fontSize: 16, color: LOGIN.g1, paddingVertical: 3, paddingHorizontal: 0 },

  // ── Airline picker sheet ──
  sheet: { flex: 1 },
  sheetInner: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl24,
    paddingVertical: space.lg16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LOGIN.frostLine,
  },
  sheetTitle: { ...font.h2 },
  sheetClose: { fontWeight: '800', fontSize: 16 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,.9)',
    borderRadius: radius.md,
    paddingHorizontal: space.md12,
    marginHorizontal: space.lg16,
    marginVertical: space.md12,
    borderWidth: 1,
    borderColor: LOGIN.frostLine,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 16, color: LOGIN.g1 },
  searchClear: { color: LOGIN.g2, fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg16,
    paddingVertical: space.md12,
    gap: space.md12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LOGIN.frostLine,
  },
  pickCode: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LOGIN.frost,
    alignItems: 'center',
  },
  pickCodeActive: { backgroundColor: '#fff' },
  pickCodeText: { fontSize: 13, fontWeight: '800', color: LOGIN.ink },
  pickCodeTextActive: { color: LOGIN.g1 },
  pickName: { flex: 1, fontSize: 16, color: LOGIN.ink, fontWeight: '500' },
  pickNameActive: { fontWeight: '800' },
  pickReady: { fontSize: 11, fontWeight: '700', color: LOGIN.inkSoft },
  pickCheck: { fontSize: 16, fontWeight: '900', color: LOGIN.ink },
  pickEmpty: { textAlign: 'center', color: LOGIN.inkFaint, marginTop: space.xxl32, fontSize: 14 },

  pwRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  // The reveal control is an eye glyph (Ryan 2026-09-11) — the old Show/Hide text
  // link repeated what the icon now says.

  keepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md12, marginTop: space.xl24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(30,61,56,.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: LOGIN.g1, borderColor: LOGIN.g1 },
  checkMark: { color: colors.onPrimary, fontSize: 14, fontWeight: '900' },
  keepText: { ...font.body, color: LOGIN.g1, fontWeight: '600' },

  loginBtn: {
    backgroundColor: LOGIN.btn,
    borderRadius: 12,
    paddingVertical: space.lg16,
    alignItems: 'center',
    marginTop: space.xl24,
  },
  loginBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Guest + social entry ──
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    marginTop: space.xl24,
  },
  orRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(30,61,56,.22)',
  },
  // Inside the white card the palette's `ink`/`inkSoft` are white-on-gradient
  // tokens and would vanish; muted is the card's own secondary text colour.
  orText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  // The reference crop spaces the three brand marks well apart with no chrome
  // around them, so each is a bare 48pt tap target.
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
    marginTop: space.lg16,
  },
  socialBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  // Only the spacing differs: the button itself is `loginBtn`, so the two entries
  // into the app can never drift apart in fill, height or radius.
  guestBtnGap: { marginTop: space.md12 },
});
