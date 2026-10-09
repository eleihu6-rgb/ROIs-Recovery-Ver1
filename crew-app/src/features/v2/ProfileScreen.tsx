// Profile tab — mirrors mock Ver9: title + bell/gear, avatar + rank chip,
// block-hours status card, settings rows, Log Out.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, ScrollView, Pressable, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, type AppDialogTone } from '../../components/v2/AppDialog';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { ALL_ORIENTATIONS, WIDE_MIN_WIDTH, useLayout } from '../../components/v2/useLayout';
import { Icon, type IconName } from '../../components/v2/icons';
import { NavRow } from '../../components/v2/rows';
import { CrewAvatar, AVATAR_COUNT, avatarForCrew } from '../settings/avatars';
import { airlineByCode } from '../auth/airlines';
import { logout, selectCrewCarrier, selectIsGuest } from '../auth/authSlice';
import { PROVIDER_LABELS, sessionDisplayName } from '../auth/identity';
import { setAvatarIndex } from '../settings/settingsSlice';
import { countryName } from '../settings/countries';
import { EmbeddedPageContext, ListCard } from './PageShell';
import { PersonalInfoScreen } from './PersonalInfoScreen';
import { AlarmsSettingsScreen } from './AlarmsSettingsScreen';
import { TimeZoneScreen } from './TimeZoneScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { SpecPage } from './SpecPage';
import { IconButton } from './HomeScreen';
import { useMonth } from './useV2';
import { useV2Nav } from './nav';

const TZ_LABEL = { airport: 'Airport local', base: 'Base time', utc: 'UTC', device: 'Phone local' } as const;
type ProfileSection = 'personal' | 'alarms' | 'timezone' | 'preferences' | 'privacy' | 'help';

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
  const [selectedSection, setSelectedSection] = useState<ProfileSection>('personal');
  const avatar = avatarIndex ?? avatarForCrew(crewId);
  const [now] = useState(() => new Date());
  const month = useMonth(now.getFullYear(), now.getMonth(), now);
  const hours = Math.round(month.blockMinutes / 60);
  // One product pop-up (pop-up standard: status card, not a native alert).
  const [dialog, setDialog] = useState<{
    tone: AppDialogTone; icon?: IconName; title: string; message?: string;
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

  const onLogout = () => setDialog({
    tone: 'destructive',
    icon: 'logout',
    title: 'Log out',
    message: 'Log out and return to the login screen?',
    cancelLabel: 'Cancel',
    confirmLabel: 'Log out',
    onConfirm: () => dispatch(logout()),
  });

  // The way back for a guest: sign out of the roster-less session and land on the
  // airline login. Nothing else changes — the guest keeps their settings.
  const onAddAirline = () => setDialog({
    tone: 'warning',
    icon: 'globe',
    title: 'Sign in with your airline',
    message: 'You will return to the login screen to sign in with your crew ID and pull your roster.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Continue',
    onConfirm: () => dispatch(logout()),
  });

  // Name on top, then the roster facts (id · base · nationality). The crew id stays
  // visible — it was just never the right thing to lead with.
  const meta = guest
    ? [email, 'No airline account'].filter(Boolean).join(' · ')
    : [crewId, crewBase, countryName(nationality)].filter(Boolean).join(' · ');

  // Duo inner screen: landscape = two columns; rotated = one column capped at a
  // phone-and-a-half, centred (a settings list reads top-down, it is not split).
  const { wide, tall, width, height } = useLayout();
  // A large window in both axes (iPad): keep settings at reading density.
  // The Duo's 669pt landscape height retains its existing edge-to-edge layout.
  const tablet = wide && height >= WIDE_MIN_WIDTH;
  const tabletLandscape = tablet && width > height;
  const stretch = wide && !tablet;
  // The Duo cover is short enough that the last action otherwise rests under
  // the floating dock. Tighten only its vertical gaps; full-height phones keep
  // their established spacing.
  const shortCompact = !wide && !tall && height < 700;
  const avatarSize = stretch ? 48 : tablet ? 64 : 80;
  const railWidth = Math.max(insets.right, 64);
  const openSection = (section: ProfileSection) => {
    if (stretch) { setSelectedSection(section); return; }
    switch (section) {
      case 'personal': nav.navigate('PersonalInfo'); break;
      case 'alarms': nav.navigate('AlarmsSettings'); break;
      case 'timezone': nav.navigate('TimeZone'); break;
      case 'preferences': nav.navigate('Preferences'); break;
      case 'privacy': nav.navigate('Spec', { id: 'privacy' }); break;
      case 'help': nav.navigate('Spec', { id: 'help' }); break;
    }
  };
  const detailPage = () => {
    switch (selectedSection) {
      case 'personal': return <PersonalInfoScreen />;
      case 'alarms': return <AlarmsSettingsScreen />;
      case 'timezone': return <TimeZoneScreen />;
      case 'preferences': return <PreferencesScreen />;
      case 'privacy':
      case 'help': return <SpecPage route={{ params: { id: selectedSection } } as never} navigation={nav as never} />;
    }
  };
  // Wide: each settings row takes an equal share of the stretched card, centred
  // above its dashed line; elsewhere the rows stack at their natural height.
  const settingRow = (row: React.ReactNode, last = false) => (
    <View style={stretch ? s.rowFill : undefined}>
      {stretch ? <View style={s.rowCenter}>{row}</View> : row}
      {last ? null : <DashedLine color={p.cardLine} />}
    </View>
  );
  const titleRow = (
      <View style={s.titleRow}>
        <Text style={[s.title, { color: p.ink }]}>My Profile</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton name="bell" badge={alertCount} palette={p} onPress={() => nav.navigate('Alerts')} testID="profile-alerts" />
          <IconButton name="gear" palette={p} onPress={() => nav.navigate('Spec', { id: 'settings' })} testID="profile-settings" />
        </View>
      </View>
  );
  const avatarEl = (
        <Pressable onPress={() => setAvatarOpen(true)} testID="profile-avatar" accessibilityLabel="Change avatar">
          <View style={[s.avatar, (tablet || stretch) && { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }, p.isLight && { backgroundColor: p.dockInk, borderColor: p.cardLine }]}>
            <CrewAvatar index={avatar} size={avatarSize} bare />
            <View style={s.cam}><Icon name="cam" size={14} color={p.dockInk} strokeWidth={2} /></View>
          </View>
        </Pressable>
  );
  const identityEls = (
        <>
          <Text style={[s.name, stretch && s.center, { color: p.ink }]} testID="profile-crew-name">
            {guest ? identityName : crewName || crewId}
          </Text>
          <Text style={[s.meta, stretch && s.center, { color: p.inkSoft }]} testID="profile-crew-meta">{meta}</Text>
          <View style={[s.chip, stretch && s.chipCenter, { backgroundColor: p.frost, borderColor: p.frostLine }]}>
            <Text style={[s.chipText, { color: p.ink }]} testID="profile-provider-chip">
              {guest ? PROVIDER_LABELS[provider ?? 'guest'] : airlineByCode(airline).name}
            </Text>
            {guest ? null : <Icon name="star" size={12} color="#f2c14e" />}
          </View>
        </>
  );
  const statusSection = (
      guest ? (
        <Pressable style={[s.status, wide && s.statusWide, shortCompact && s.statusShort, { backgroundColor: p.frost }]} onPress={onAddAirline} testID="profile-add-airline">
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
      <Pressable style={[s.status, wide && s.statusWide, shortCompact && s.statusShort, { backgroundColor: p.frost }]} onPress={() => nav.navigate('Spec', { id: 'limits' })} testID="profile-block-hours">
        <View style={s.statusIc}><Icon name="crown" size={22} color={p.isLight ? p.warn : '#e9a53a'} /></View>
        <View style={{ flex: 1 }}><Text style={[s.statusT, { color: p.ink }]}>Block hours this month</Text><Text style={[s.statusS, { color: p.inkSoft }]}>{month.flightCount} flights · rolling 28-day limit 100h</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={[s.num, p.isLight && { color: p.cardInk }]}>{hours}</Text><Text style={[s.numS, { color: p.inkSoft }]}>OF 100 H</Text></View>
      </Pressable>
      )
  );
  const headSection = (
    <>
      {titleRow}
      <View style={s.head}>
        {avatarEl}
        <View style={{ flex: 1 }}>{identityEls}</View>
      </View>

      {statusSection}
    </>
  );
  const settingsCard = (
      <ListCard palette={p} style={stretch ? s.listFill : wide ? undefined : { marginTop: shortCompact ? 12 : 22 }}>
        {settingRow(<NavRow icon="user" label="Personal Information" palette={p} onPress={() => openSection('personal')} testID="row-personal" />)}
        {settingRow(<NavRow icon="bell" label="Alarms & Meetings" value={alarmsEnabled ? 'On' : 'Off'} palette={p} onPress={() => openSection('alarms')} testID="row-alarms" />)}
        {settingRow(<NavRow icon="clock" label="Time Zone" value={TZ_LABEL[tz]} palette={p} onPress={() => openSection('timezone')} testID="row-timezone" />)}
        {settingRow(<NavRow icon="sliders" label="Preferences" palette={p} onPress={() => openSection('preferences')} testID="row-preferences" />)}
        {settingRow(<NavRow icon="shield" label="Privacy & Security" palette={p} onPress={() => openSection('privacy')} testID="row-privacy" />)}
        {settingRow(<NavRow icon="headset" label="Help & Support" palette={p} onPress={() => openSection('help')} testID="row-help" />, true)}
      </ListCard>
  );
  const logoutButton = (
      <Pressable style={[s.logout, shortCompact && s.logoutShort, wide && [s.logoutWide, { backgroundColor: p.frost }]]} onPress={onLogout} testID="profile-logout"><Icon name="logout" size={20} color={p.ink} /><Text style={[s.logoutText, { color: p.ink }]}>Log Out</Text></Pressable>
  );
  const settingsSection = (
    <>
      {settingsCard}

      {logoutButton}
    </>
  );

  return (
    <GradientScreen palette={p} sideInsets={!stretch}>
      <ScrollView contentContainerStyle={[s.body, wide && s.bodyFill, { paddingTop: insets.top + 8 }, stretch && { paddingLeft: insets.left + 22, paddingRight: railWidth + 22 }]} showsVerticalScrollIndicator={false} testID="profile-screen">
        {stretch ? (
          <View style={s.wideFill} testID="profile-wide">
            {titleRow}
            <View style={[s.duoCols, { height: Math.max(360, height - insets.top - 185) }]}>
              <View style={s.duoMenu} testID="profile-menu">{settingsCard}</View>
              <View style={s.duoDetail} testID="profile-detail">
                <EmbeddedPageContext.Provider value>{detailPage()}</EmbeddedPageContext.Provider>
              </View>
            </View>
          </View>
        ) : wide ? (
          // iPhone Duo inner screen: the page fills the screen down to the dock — title
          // across the top; identity, block hours and Log Out left; the settings card
          // right, stretched to the same height so both columns end level.
          <View style={[s.wideFill, tablet && s.tabletPage, tabletLandscape && s.tabletLandscapePage]} testID="profile-wide">
            {titleRow}
            <View style={[s.wideCols, tablet && s.tabletCols]}>
              <View style={s.wideCol}>
                <View style={[s.idCard, tablet && s.tabletId, { backgroundColor: p.frost }]} testID="profile-id-card">
                  {avatarEl}
                  {tablet ? <View style={s.tabletIdentity}>{identityEls}</View> : identityEls}
                </View>
                {statusSection}
                {logoutButton}
              </View>
              <View style={s.wideCol}>{settingsCard}</View>
            </View>
          </View>
        ) : tall ? (
          <View style={s.tallCol} testID="profile-tall">
            {headSection}
            {settingsSection}
          </View>
        ) : (
          <>
            {headSection}
            {settingsSection}
          </>
        )}
      </ScrollView>
      {stretch ? (
        <View style={[s.profileRailEdge, { width: railWidth }]} testID="profile-rail">
          {avatarEl}
          <Pressable style={[s.railIcon, { backgroundColor: p.frost, borderColor: p.frostLine }]} onPress={guest ? onAddAirline : () => nav.navigate('Spec', { id: 'limits' })} testID={guest ? 'profile-add-airline' : 'profile-block-hours'} accessibilityLabel={guest ? 'Sign in with your airline' : 'Block hours'}>
            <Icon name={guest ? 'globe' : 'clock'} size={22} color={p.ink} />
          </Pressable>
          <Pressable style={[s.railIcon, { backgroundColor: p.frost, borderColor: p.frostLine }]} onPress={onLogout} testID="profile-logout" accessibilityLabel="Log out">
            <Icon name="logout" size={22} color={p.ink} />
          </Pressable>
        </View>
      ) : null}

      {/* Avatar picker — tap the profile picture to swap the cartoon character. */}
      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)} supportedOrientations={ALL_ORIENTATIONS}>
        <Pressable style={s.backdrop} onPress={() => setAvatarOpen(false)}>
          <Pressable style={[s.sheet, tablet && s.tabletSheet, { backgroundColor: p.g1 }]} onPress={() => {}} testID="profile-avatar-picker">
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

      <AppDialog
        visible={dialog !== null}
        onClose={closeDialog}
        onConfirm={confirmDialog}
        tone={dialog?.tone ?? 'neutral'}
        icon={dialog?.icon}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        cancelLabel={dialog?.cancelLabel}
        confirmLabel={dialog?.confirmLabel}
        onCancel={closeDialog}
        testID="profile-dialog"
      />
    </GradientScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 110 },
  bodyFill: { flexGrow: 1 },
  wideFill: { flex: 1 },
  tabletPage: { flex: 0, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  // The iPad landscape dashboard has much more vertical room than a Duo. Centre
  // its bounded profile composition in that work area instead of pinning a
  // small settings card to the top edge.
  tabletLandscapePage: { minHeight: 630, justifyContent: 'center' },
  tabletCols: { flex: 0, alignItems: 'flex-start' },
  tabletId: { flex: 0, minHeight: 160, flexDirection: 'row', gap: 16, justifyContent: 'flex-start' },
  tabletIdentity: { flex: 1, minWidth: 0 },
  tabletSheet: { maxWidth: 520 },
  wideCols: { flex: 1, flexDirection: 'row', gap: 18, marginTop: 14 },
  wideCol: { flex: 1, minWidth: 0 },
  duoCols: { flex: 1, flexDirection: 'row', gap: 12, marginTop: 14 },
  duoMenu: { flex: 0.92, minWidth: 0 },
  duoDetail: { flex: 1, minWidth: 0 },
  profileRailEdge: { position: 'absolute', right: 0, top: 116, alignItems: 'center', gap: 12 },
  railIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  idCard: { flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  center: { textAlign: 'center' },
  chipCenter: { alignSelf: 'center' },
  listFill: { flex: 1 },
  rowFill: { flex: 1 },
  rowCenter: { flex: 1, justifyContent: 'center' },
  statusWide: { marginTop: 14 },
  statusShort: { marginTop: 12 },
  logoutWide: { marginTop: 14, borderRadius: 16, paddingVertical: 14 },
  tallCol: { width: '100%', maxWidth: 560, alignSelf: 'center' },
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
  logoutShort: { marginTop: 4 },
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
