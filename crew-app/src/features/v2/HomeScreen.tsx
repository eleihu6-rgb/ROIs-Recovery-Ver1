// Home tab — mirrors mock Ver9: brand row (white carrier logo · alerts bell ·
// upcoming-alarms icon), time-of-day greeting, crew status line, Upcoming Trip
// ticket card (or the no-duty placeholder), Explore destinations, Quick actions.
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store';
import { selectCrewCarrier, selectIsGuest } from '../auth/authSlice';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon, type IconName } from '../../components/v2/icons';
import { BrandLogo } from '../../components/v2/BrandLogo';
import { TicketCard, DashedLine } from '../../components/v2/TicketCard';
import { daysUntil, greetingFor, legView, tripStartMs, MON } from './model';
import { useAlarms, useDestinations, useNextTrip } from './useV2';
import { useV2Nav } from './nav';

// The dock floats over the page, so the scroll content carries its own clearance.
// 110 (dock height + the bottom inset) left the Quick actions card half-under the
// pill at rest and only ~14pt clear after a full scroll; 150 clears it and still
// reads as one page (Ryan, 2026-09-11).
const DOCK_CLEAR = 150;

export function HomeScreen() {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useV2Nav();
  // Brand with the crew's own carrier when the roster resolved one (crew K1003 =
  // EK), else the airline they signed in with.
  const airline = useAppSelector(selectCrewCarrier) ?? 'TG';
  const alertCount = useAppSelector(s => s.notifications.notifications.length);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const guest = useAppSelector(selectIsGuest);

  const [now, setNow] = useState(() => new Date());
  const [holeY, setHoleY] = useState<number | undefined>(undefined); // measured from the dashed line
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const greet = greetingFor(now);
  const trip = useNextTrip(now);
  const { byTrip, all: alarms } = useAlarms(now);
  const first = trip ? legView(trip.legs[0], trip, mode, baseTz, byTrip[trip.id]) : null;
  const inDays = trip ? daysUntil(tripStartMs(trip), now) : 0;
  const alarmCount = alarmsEnabled ? alarms.reduce((n, a) => n + (a.wakeUp ? 1 : 0) + (a.leaveHome ? 1 : 0), 0) : 0;

  // Explore: this month's upcoming rotations, one card per destination. The same
  // list backs the full-screen city viewer, so the tapped card is the page it opens.
  const destinations = useDestinations(now);

  return (
    <GradientScreen palette={p}>
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 10, paddingBottom: DOCK_CLEAR }]} showsVerticalScrollIndicator={false} testID="home-screen">
        <View style={s.brandRow}>
          <BrandLogo airline={airline} height={34} />
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <IconButton name="bell" badge={alertCount} palette={p} onPress={() => nav.navigate('Alerts')} testID="home-alerts" />
            <IconButton name="alarm" badge={alarmCount} palette={p} onPress={() => nav.navigate('UpcomingAlarms')} testID="home-alarms" />
          </View>
        </View>

        <View style={s.greet}>
          <Icon name={greet.icon} size={34} color={p.ink} />
          <Text style={[s.greetText, { color: p.ink }]} testID="home-greeting">{greet.text}</Text>
        </View>

        {/* Why the roster is empty: this session has no airline behind it, and
            Profile holds the way to add one (Ryan 2026-09-12). */}
        {guest ? (
          <Pressable
            style={[s.guestStrip, { backgroundColor: p.frost }]}
            onPress={() => nav.navigate('Tabs', { screen: 'Profile' })}
            testID="home-guest-strip">
            <Icon name="user" size={20} color={p.ink} />
            <Text style={[s.guestStripText, { color: p.ink }]}>
              Browsing as a guest — sign in with your airline on Profile to see your roster.
            </Text>
            <Icon name="chev" size={18} color={p.inkSoft} />
          </Pressable>
        ) : null}
        {/* The crew/airline/base line that used to sit here is on Profile ▸ the crew
            row now; Home goes straight to the trip (or straight to Explore when
            nothing is published). */}

        {trip && first ? (
          <TicketCard palette={p} style={s.trip} holeY={holeY} onPress={() => nav.navigate('TripDetails', { tripId: trip.id })} testID="home-next-trip">
            <View style={s.uh}><Icon name="trip" size={22} color={p.cardInk} /><Text style={[s.uhText, { color: p.cardInk }]}>Upcoming Trip</Text></View>
            <Text style={[s.sub, { color: p.cardSoft }]}>{first.fltNumber} · {first.day} {MON[first.monthIdx]} {first.year} · {inDays === 0 ? 'Reports today' : `Reports in ${inDays} day${inDays === 1 ? '' : 's'}`}</Text>
            <View style={s.legRow}>
              <View style={s.leg}>
                <View><Text style={[s.cd, { color: p.cardInk }]}>{first.dep}</Text><Text style={[s.ct, { color: p.cardSoft }]}>{first.depTime}</Text></View>
                <Icon name="plane" size={20} color={p.cardInk} />
                <View><Text style={[s.cd, { color: p.cardInk }]}>{first.arv}</Text><Text style={[s.ct, { color: p.cardSoft }]}>{first.arvTime}{first.arvDayOffset ? ` ${first.arvDayOffset}` : ''}</Text></View>
              </View>
              <View style={s.kv}>
                <Text style={[s.kvk, { color: p.cardSoft }]}>Ready <Text style={[s.kvv, { color: p.cardInk }]}>{first.ready}</Text></Text>
                <Text style={[s.kvk, { color: p.cardSoft }]}>Check-in <Text style={[s.kvv, { color: p.cardInk }]}>{first.checkIn}</Text></Text>
              </View>
            </View>
            <View style={{ marginVertical: 16 }} onLayout={e => setHoleY(20 + e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}><DashedLine color={p.cardLine} /></View>
            <View style={s.btnRow}>
              <View style={[s.btn, { backgroundColor: p.btn }]}><Text style={s.btnText}>View Trip Details</Text></View>
              <View style={[s.btnSq, { backgroundColor: p.btn }]}><Icon name="qr" size={26} color="#fff" strokeWidth={1.8} /></View>
            </View>
          </TicketCard>
        ) : null}

        <View style={s.sec}><Text style={[s.secTitle, { color: p.ink }]}>Explore your destinations</Text><Text style={[s.secLink, { color: p.inkSoft }]}>See all</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.destRow} style={{ marginHorizontal: -22 }}>
          {destinations.length === 0 && <Text style={{ color: p.inkSoft, fontSize: 13 }}>No upcoming destinations this month.</Text>}
          {destinations.map((d, i) => (
            <Pressable key={d.city.airport} style={s.dest} onPress={() => nav.navigate('Destination', { index: i })} testID={`dest-${d.city.airport}`}>
              <ImageBackground source={d.city.image} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: 14 }} />
              <View style={s.destGrad} />
              <View style={s.fav}><Icon name="heart" size={16} color="#fff" strokeWidth={1.8} /></View>
              <View style={s.destBottom}>
                <Text style={[s.destCo, { color: p.inkSoft }]}>{d.city.name === d.city.airport ? 'Destination' : d.city.airport}</Text>
                <Text style={s.destCity}>{d.city.name}</Text>
                <Text style={[s.destFrom, { color: p.inkSoft }]}>FLIGHT</Text>
                <Text style={s.destFlt}>{d.leg.fltNumber} · {d.leg.day} {MON[d.leg.monthIdx]}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[s.qa, { backgroundColor: p.frost }]}>
          <Text style={[s.qaTitle, { color: p.ink }]}>Quick actions</Text>
          <View style={s.qaGrid}>
            <QA icon="checkin" label="Check-In" onPress={() => nav.navigate('Spec', { id: 'checkin' })} palette={p} />
            <QA icon="calcheck" label="Absence" onPress={() => nav.navigate('Spec', { id: 'absence' })} palette={p} />
            <QA icon="swap" label="Duty Swap" onPress={() => nav.navigate('Spec', { id: 'swap' })} palette={p} />
            <QA icon="more" label="More" onPress={() => nav.navigate('Spec', { id: 'more' })} palette={p} />
          </View>
        </View>
      </ScrollView>
    </GradientScreen>
  );
}


export function IconButton({ name, badge, palette, onPress, testID }: { name: IconName; badge?: number; palette: CarrierPalette; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={s.iconBtn} hitSlop={6} testID={testID} accessibilityLabel={testID}>
      <Icon name={name} size={24} color={palette.ink} />
      {!!badge && <View style={s.badge}><Text style={[s.badgeText, { color: palette.g1 }]}>{badge}</Text></View>}
    </Pressable>
  );
}

function QA({ icon, label, onPress, palette }: { icon: IconName; label: string; onPress: () => void; palette: CarrierPalette }) {
  return (
    <Pressable onPress={onPress} style={s.qaItem} testID={`qa-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <Icon name={icon} size={28} color={palette.ink} />
      <Text style={[s.qaLabel, { color: palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 22 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  greet: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  greetText: { fontSize: 34, fontWeight: '600', letterSpacing: -0.3 },
  // Guest strip: says why the roster is empty and opens Profile.
  guestStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  guestStripText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  trip: { marginTop: 16, padding: 16 },
  uh: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  uhText: { fontSize: 19, fontWeight: '600' },
  sub: { fontSize: 13 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cd: { fontSize: 22, fontWeight: '600' },
  ct: { fontSize: 12, marginTop: 3 },
  kv: { marginLeft: 'auto', gap: 4 },
  kvk: { fontSize: 13 },
  kvv: { fontSize: 15, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnSq: { width: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  secTitle: { fontSize: 17, fontWeight: '500' },
  secLink: { fontSize: 14, fontWeight: '500' },
  destRow: { paddingHorizontal: 22, gap: 12 },
  // 190 tall (was 215): with the trip card above it the page used to end under the
  // dock, and every destination's own content still fits the shorter tile.
  dest: { width: 165, height: 172, borderRadius: 14, overflow: 'hidden' },
  // Neutral black scrim over the destination photo — a tinted scrim would fight
  // whichever theme the crew picked (theme coverage test).
  destGrad: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.45)' },
  fav: { position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
  destBottom: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  destCo: { fontSize: 11 },
  destCity: { fontSize: 19, fontWeight: '600', color: '#fff', marginTop: 1 },
  destFrom: { fontSize: 10, letterSpacing: 0.5, marginTop: 8 },
  destFlt: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 1 },
  qa: { marginTop: 14, borderRadius: 18, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
  qaTitle: { fontSize: 17, fontWeight: '500', marginBottom: 12 },
  qaGrid: { flexDirection: 'row', gap: 8 },
  qaItem: { flex: 1, alignItems: 'center', gap: 10 },
  qaLabel: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
});
