// Profile tab — mirrors mock Ver9: title + bell/gear, avatar + rank chip,
// block-hours status card, settings rows, Log Out.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';
import { NavRow } from '../../components/v2/rows';
import { CrewAvatar, AVATAR_COUNT, avatarForCrew } from '../settings/avatars';
import { airlineByCode } from '../auth/airlines';
import { logout, selectCrewCarrier, selectIsGuest } from '../auth/authSlice';
import { PROVIDER_LABELS, sessionDisplayName } from '../auth/identity';
import { setAvatarIndex } from '../settings/settingsSlice';
import { countryName } from '../settings/countries';
import { ListCard } from './PageShell';
import { IconButton } from './HomeScreen';
import { useMonth } from './useV2';
import { useV2Nav } from './nav';

const TZ_LABEL = { airport: 'Airport local', base: 'Base time', utc: 'UTC', device: 'Phone local' } as const;

export function ProfileScreen() {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  // The carrier chip names the airline the crew FLIES (K1003 = Emirates), which
  // the roster resolved — not the option they signed in through.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  // A guest (or a social sign-in) has no airline behind the session: the chip
  // names the way they came in and the name comes from the provider.
  const guest = useAppSelector(selectIsGuest);
  const provider = useAppSelector(s => s.auth.provider);
  const identityName = useAppSelector(s => sessionDisplayName(s.auth.displayName, s.auth.provider));
  const email = useAppSelector(s => s.auth.email);
  const alertCount = useAppSelector(s => s.notifications.notifications.length);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const tz = useAppSelector(s => s.settings.timeZoneMode);
  const crewName = useAppSelector(s => `${s.auth.firstName ?? ''} ${s.auth.lastName ?? ''}`.trim());
  const crewBase = useAppSelector(s => s.auth.base) ?? '';
  const nationality = useAppSelector(s => s.auth.nationality);
  const avatarIndex = useAppSelector(s => s.settings.avatarIndex);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatar = avatarIndex ?? avatarForCrew(crewId);
  const [now] = useState(() => new Date());
  const month = useMonth(now.getFullYear(), now.getMonth(), now);
  const hours = Math.round(month.blockMinutes / 60);
  const divider = {};

  const onLogout = () => Alert.alert('Log out', 'Log out and return to the login screen?', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => dispatch(logout()) },
  ]);

  // The way back for a guest: sign out of the roster-less session and land on the
  // airline login. Nothing else changes — the guest keeps their settings.
  const onAddAirline = () => Alert.alert(
    'Sign in with your airline',
    'You will return to the login screen to sign in with your crew ID and pull your roster.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => dispatch(logout()) }],
  );

  // Name on top, then the roster facts (id · base · nationality). The crew id stays
  // visible — it was just never the right thing to lead with.
  const meta = guest
    ? [email, 'No airline account'].filter(Boolean).join(' · ')
    : [crewId, crewBase, countryName(nationality)].filter(Boolean).join(' · ');

  return (
    <GradientScreen palette={p}>
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 8 }]} showsVerticalScrollIndicator={false} testID="profile-screen">
        <View style={s.titleRow}>
          <Text style={[s.title, { color: p.ink }]}>My Profile</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <IconButton name="bell" badge={alertCount} palette={p} onPress={() => nav.navigate('Alerts')} testID="profile-alerts" />
            <IconButton name="gear" palette={p} onPress={() => nav.navigate('Spec', { id: 'settings' })} testID="profile-settings" />
          </View>
        </View>
        <View style={s.head}>
          <Pressable onPress={() => setAvatarOpen(true)} testID="profile-avatar" accessibilityLabel="Change avatar">
            <View style={s.avatar}>
              <CrewAvatar index={avatar} size={80} bare />
              <View style={s.cam}><Icon name="cam" size={14} color={p.g1} strokeWidth={2} /></View>
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: p.ink }]} testID="profile-crew-name">
              {guest ? identityName : crewName || crewId}
            </Text>
            <Text style={[s.meta, { color: p.inkSoft }]} testID="profile-crew-meta">{meta}</Text>
            <View style={[s.chip, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
              <Text style={[s.chipText, { color: p.ink }]} testID="profile-provider-chip">
                {guest ? PROVIDER_LABELS[provider ?? 'guest'] : airlineByCode(airline).name}
              </Text>
              {guest ? null : <Icon name="star" size={12} color="#f2c14e" />}
            </View>
          </View>
        </View>

        {guest ? (
          <Pressable style={[s.status, { backgroundColor: p.frost }]} onPress={onAddAirline} testID="profile-add-airline">
            <View style={s.statusIc}><Icon name="globe" size={22} color={p.ink} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.statusT, { color: p.ink }]}>Sign in with your airline</Text>
              <Text style={[s.statusS, { color: p.inkSoft }]}>
                Add your crew ID to see your roster, block hours and trip trade.
              </Text>
            </View>
            <Icon name="chev" size={20} color={p.inkSoft} />
          </Pressable>
        ) : (
        <Pressable style={[s.status, { backgroundColor: p.frost }]} onPress={() => nav.navigate('Spec', { id: 'limits' })} testID="profile-block-hours">
          <View style={s.statusIc}><Icon name="crown" size={22} color="#e9a53a" /></View>
          <View style={{ flex: 1 }}><Text style={[s.statusT, { color: p.ink }]}>Block hours this month</Text><Text style={[s.statusS, { color: p.inkSoft }]}>{month.flightCount} flights · rolling 28-day limit 100h</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={s.num}>{hours}</Text><Text style={[s.numS, { color: p.inkSoft }]}>OF 100 H</Text></View>
        </Pressable>
        )}

        <ListCard palette={p} style={{ marginTop: 22 }}>
          <View style={divider}><NavRow icon="user" label="Personal Information" palette={p} onPress={() => nav.navigate('PersonalInfo')} testID="row-personal" /><DashedLine color={p.cardLine} /></View>
          <View style={divider}><NavRow icon="bell" label="Alarms & Meetings" value={alarmsEnabled ? 'On' : 'Off'} palette={p} onPress={() => nav.navigate('AlarmsSettings')} testID="row-alarms" /><DashedLine color={p.cardLine} /></View>
          <View style={divider}><NavRow icon="clock" label="Time Zone" value={TZ_LABEL[tz]} palette={p} onPress={() => nav.navigate('TimeZone')} testID="row-timezone" /><DashedLine color={p.cardLine} /></View>
          <View style={divider}><NavRow icon="sliders" label="Preferences" palette={p} onPress={() => nav.navigate('Preferences')} testID="row-preferences" /><DashedLine color={p.cardLine} /></View>
          <View style={divider}><NavRow icon="shield" label="Privacy & Security" palette={p} onPress={() => nav.navigate('Spec', { id: 'privacy' })} testID="row-privacy" /><DashedLine color={p.cardLine} /></View>
          <NavRow icon="headset" label="Help & Support" palette={p} onPress={() => nav.navigate('Spec', { id: 'help' })} testID="row-help" />
        </ListCard>

        <Pressable style={s.logout} onPress={onLogout} testID="profile-logout"><Icon name="logout" size={20} color={p.ink} /><Text style={[s.logoutText, { color: p.ink }]}>Log Out</Text></Pressable>
      </ScrollView>

      {/* Avatar picker — tap the profile picture to swap the cartoon character. */}
      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setAvatarOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: p.g1 }]} onPress={() => {}}>
            <Text style={[s.sheetTitle, { color: p.ink }]}>Choose your avatar</Text>
            <Text style={[s.sheetSub, { color: p.inkSoft }]}>Tap a character — it is stored on this phone.</Text>
            <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
              {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => { dispatch(setAvatarIndex(i)); setAvatarOpen(false); }}
                  testID={`avatar-${i}`}
                  style={[s.tile, i === avatar ? [s.tileOn, { borderColor: p.ink }] : null]}
                >
                  <CrewAvatar index={i} size={50} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => { dispatch(setAvatarIndex(null)); setAvatarOpen(false); }} testID="avatar-default">
              <Text style={[s.sheetReset, { color: p.inkSoft }]}>Use my crew default</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </GradientScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 110 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { fontSize: 26, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: 'rgba(255,255,255,.5)', alignItems: 'center', justifyContent: 'center' },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },
  status: { marginTop: 26, borderRadius: 16, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  statusIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  statusT: { fontSize: 15, fontWeight: '600' },
  statusS: { fontSize: 11, marginTop: 2 },
  num: { fontSize: 20, fontWeight: '600', color: '#f2c14e' },
  numS: { fontSize: 10 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26 },
  logoutText: { fontSize: 16, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  sheet: { width: '100%', borderRadius: 22, padding: 18, maxHeight: '72%' },
  sheetTitle: { fontSize: 18, fontWeight: '600' },
  sheetSub: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  tile: { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  tileOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  sheetReset: { fontSize: 13, textAlign: 'center', paddingVertical: 14 },
});
