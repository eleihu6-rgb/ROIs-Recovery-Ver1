// Native street map for the portal's actual check-in point. Apple Maps on iOS
// needs no token; the Schedule route map is an unrelated offline SVG.
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Circle, type Region } from 'react-native-maps';
import { Icon } from '../../components/v2/icons';
import type { CarrierPalette } from '../../theme/carrier';
import type { LatLon } from '../v2/schedView';

const MAP_HEIGHT = 220;
const START_DELTA = 0.025;
const MIN_DELTA = 0.002;
const MAX_DELTA = 0.12;

const regionAt = (pin: LatLon): Region => ({
  latitude: pin.lat, longitude: pin.lon,
  latitudeDelta: START_DELTA, longitudeDelta: START_DELTA,
});

export function CheckInMap({ pin, radiusM, locationKind, airport, palette: p, fill }: {
  pin: LatLon;
  radiusM: number | null;
  locationKind: 'checkin-point' | 'airport';
  airport: string;
  palette: CarrierPalette;
  fill?: boolean;
}): React.JSX.Element {
  const exact = locationKind === 'checkin-point';
  const map = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(() => regionAt(pin));
  const zoom = (factor: number) => {
    const next = {
      ...region,
      latitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, region.latitudeDelta * factor)),
      longitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, region.longitudeDelta * factor)),
    };
    setRegion(next);
    map.current?.animateToRegion?.(next, 200);
  };
  return (
    <View style={[s.card, { backgroundColor: p.isLight ? p.mapBg : p.g1, borderColor: p.frostLine }, fill && s.fill]} testID="checkin-map">
      <MapView
        ref={map}
        key={`${pin.lat}:${pin.lon}`}
        testID="checkin-native-map"
        style={StyleSheet.absoluteFillObject}
        initialRegion={regionAt(pin)}
        onRegionChangeComplete={setRegion}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={p.isLight ? 'light' : 'dark'}
        showsCompass
        zoomEnabled
        scrollEnabled
        rotateEnabled
        accessibilityLabel={`${exact ? 'Check-in point' : 'Departure airport'} map at ${airport}`}
      >
        {exact && radiusM ? (
          <Circle testID="checkin-radius" center={{ latitude: pin.lat, longitude: pin.lon }} radius={radiusM} strokeColor={p.isLight ? p.mapRoute : p.dockLight} fillColor={`${p.btn}55`} />
        ) : null}
        <Marker
          testID="checkin-airport-pin"
          coordinate={{ latitude: pin.lat, longitude: pin.lon }}
          title={exact ? 'Check-in point' : `${airport} airport area`}
          description={radiusM ? `${radiusM} m check-in radius` : undefined}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={[s.pin, { backgroundColor: p.isLight ? p.mapRoute : p.dockInk, borderColor: p.dockLight }]} testID="checkin-pin-hub">
            <View style={[s.pinCore, { backgroundColor: p.dockLight }]} />
          </View>
        </Marker>
      </MapView>
      <View style={[s.tint, { backgroundColor: p.isLight ? p.mapBg : p.g1, opacity: p.isLight ? 0.16 : 0.3 }]} pointerEvents="none" testID="checkin-map-tint" />
      <View style={[s.badge, { backgroundColor: p.isLight ? p.mapPanel : p.dockInk }]} pointerEvents="none" testID="checkin-map-badge">
        <Text style={[s.badgeText, { color: p.isLight ? p.cardInk : p.ink }]} testID="checkin-location-label">{exact ? 'CHECK-IN POINT' : 'AIRPORT AREA'}</Text>
      </View>
      {radiusM && exact ? (
        <View style={[s.badge, s.badgeRight, { backgroundColor: p.isLight ? p.mapPanel : p.dockInk }]} pointerEvents="none">
          <Text style={[s.badgeText, { color: p.isLight ? p.cardInk : p.ink }]}>{`${airport} · ${radiusM} m radius`}</Text>
        </View>
      ) : null}
      <View style={s.zoomCol}>
        <Pressable onPress={() => zoom(0.5)} testID="checkin-zoom-in" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityRole="button" accessibilityLabel="Zoom in">
          <Icon name="zoomIn" size={18} color={p.cardInk} />
        </Pressable>
        <Pressable onPress={() => zoom(2)} testID="checkin-zoom-out" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityRole="button" accessibilityLabel="Zoom out">
          <Icon name="zoomOut" size={18} color={p.cardInk} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { height: MAP_HEIGHT, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  fill: { flex: 1, height: undefined, minHeight: MAP_HEIGHT },
  tint: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  pin: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinCore: { width: 6, height: 6, borderRadius: 3 },
  badge: { position: 'absolute', left: 10, top: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeRight: { left: undefined, right: 10 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  zoomCol: { position: 'absolute', right: 8, bottom: 8, gap: 8 },
  zoomBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
