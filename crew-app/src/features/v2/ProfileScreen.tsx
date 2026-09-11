// Profile tab — mirrors mock Ver9: title + bell/gear, avatar + rank chip,
// block-hours status card, settings rows, Log Out.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';
import { NavRow } from '../../components/v2/rows';
import { CrewAvatar, avatarForCrew } from '../settings/avatars';
import { airlineByCode } from '../auth/airlines';
import { logout } from '../auth/authSlice';
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
  const airline = useAppSelector(s => s.auth.airline) ?? '';
  const alertCount = useAppSelector(s => s.notifications.notifications.length);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const tz = useAppSelector(s => s.settings.timeZoneMode);
  const [now] = useState(() => new Date());
  const month = useMonth(now.getFullYear(), now.getMonth(), now);
  const hours = Math.round(month.blockMinutes / 60);
  const divider = {};

  const onLogout = () => Alert.alert('Log out', 'Log out and return to the login screen?', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => dispatch(logout()) },
  ]);

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
          <View style={s.avatar}><CrewAvatar index={avatarForCrew(crewId)} size={80} bare /><View style={s.cam}><Icon name="cam" size={14} color={p.g1} strokeWidth={2} /></View></View>
          <View>
            <Text style={[s.name, { color: p.ink }]} testID="profile-crew-id">Crew {crewId}</Text>
            <View style={[s.chip, { backgroundColor: p.frost, borderColor: p.frostLine }]}><Text style={[s.chipText, { color: p.ink }]}>{airlineByCode(airline).name}</Text><Icon name="star" size={12} color="#f2c14e" /></View>
          </View>
        </View>

        <Pressable style={[s.status, { backgroundColor: p.frost }]} onPress={() => nav.navigate('Spec', { id: 'limits' })} testID="profile-block-hours">
          <View style={s.statusIc}><Icon name="crown" size={22} color="#e9a53a" /></View>
          <View style={{ flex: 1 }}><Text style={[s.statusT, { color: p.ink }]}>Block hours this month</Text><Text style={[s.statusS, { color: p.inkSoft }]}>{month.flightCount} flights · rolling 28-day limit 100h</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={s.num}>{hours}</Text><Text style={[s.numS, { color: p.inkSoft }]}>OF 100 H</Text></View>
        </Pressable>

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
});
