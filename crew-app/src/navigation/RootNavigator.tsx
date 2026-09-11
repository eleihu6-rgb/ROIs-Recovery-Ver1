import React from 'react';
import { View, ActivityIndicator, TouchableOpacity, StyleSheet, Platform, GestureResponderEvent } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../store';
import { colors } from '../theme';

// Screens
import { HomeScreen } from '../features/home/HomeScreen';
import { MyDutyScreen } from '../features/tripTrade/MyDutyScreen';
import { TravelScreen } from '../features/travel/TravelScreen';
import { ExploreScreen } from '../features/explore/ExploreScreen';
import { ProfileScreen } from '../features/settings/ProfileScreen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { LoginCaptureScreen } from '../features/auth/LoginCaptureScreen';
import { EkRosterLoginScreen } from '../features/auth/EkRosterLoginScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { V2Navigator } from '../features/v2/V2Navigator';

// v2 redesign (mock-mirror, Sep 2026): the 4-tab pill dock replaces the legacy
// 6-tab bar. The legacy MainTabs below is retained until the v2 rollout is
// signed off, then removed.
const USE_V2 = true;

export type AuthStackParamList = {
  Login: undefined;
  Capture: { airline: string; crewId: string; password: string; keepLogin: boolean };
  EkRoster: { airline: string; crewId: string; password: string; keepLogin: boolean };
};

export type RootStackParamList = AuthStackParamList & {
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  FlightStatus: undefined;
  Explore: undefined;
  MyTrips: undefined;
  Alerts: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// TEMP flag for autonomous simulator testing: when true the app boots straight
// into the crew-portal capture (auto-login) so the flow can be verified without
// tapping. Set back to false for the normal login-first flow. Gated with
// __DEV__ so a release build can never enter this path (enhance-Ver5 #1).
const DEV_AUTOSTART_CAPTURE = __DEV__ && false;
// TEMP (sim display test only): render the main tabs without a login/keychain
// session, so seeded @royce_trips can be inspected. __DEV__-gated; MUST stay
// false for delivery (enhance-Ver5 #1).
const DEV_FORCE_MAIN = __DEV__ && false;

// ─── Design tokens ──────────────────────────────────────────────────────────
// Colours come from the shared theme (enhance-Ver1 #8); only layout sizing is
// local to navigation.
const ACTIVE_COLOR = colors.navActive;
const INACTIVE_COLOR = colors.navInactive;
const INDICATOR_COLOR = colors.navIndicator;
const TAB_BAR_HEIGHT = 65;
const FAB_SIZE = 70;
const FAB_LIFT = 30; // px the FAB floats above the bar

// ─── Active indicator pill ──────────────────────────────────────────────────
function ActivePill({ focused }: { focused: boolean }) {
  if (!focused) return null;
  return (
    <View
      style={{
        width: 32,
        height: 3,
        borderRadius: 2,
        backgroundColor: INDICATOR_COLOR,
        marginBottom: 4,
      }}
    />
  );
}

// ─── Home icon (house) ──────────────────────────────────────────────────────
function HomeIcon({ focused }: { focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <View style={styles.iconWrap}>
      <ActivePill focused={focused} />
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {/* Filled house for active, outline for inactive */}
        <Path
          d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5z"
          fill={focused ? color : 'none'}
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {/* Door */}
        <Path
          d="M9 21V15h6v6"
          stroke={focused ? colors.white : color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {/* Chimney-style top notch on active */}
        {focused && (
          <Path
            d="M9.5 9.5h5v4h-5z"
            fill={colors.white}
            opacity={0}
          />
        )}
      </Svg>
    </View>
  );
}

// ─── Trip Trade icon (swap arrows) ──────────────────────────────────────────
// Replaces the old "Sign On" clock: this tab is now the Trip Trade duty-swap
// page (My Duty). Nav-bar outline style.
function TripTradeTabIcon({ focused }: { focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <View style={styles.iconWrap}>
      <ActivePill focused={focused} />
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M7 8h11l-3-3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M17 16H6l3 3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// ─── Book Flights plane icon (inside FAB) ────────────────────────────────────
// Matched to image/Navi-bar.jpg by measuring the reference silhouette: it is a
// level top-view jet rotated to point UP-RIGHT by ~18° above horizontal (an IoU
// best-fit against the reference, not the steeper 45° it appears by eye), drawn
// in a darker slate (#6F7085) than the other inactive tab icons so the centre
// action reads as primary. We rotate the same silhouette about the centre
// (16,16); react-native-svg's negative angle tilts the nose up.
const PLANE_COLOR = '#6F7085';
function PlaneIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
      {/* Airplane body, rotated nose-up-right to match the reference nav bar. */}
      <Path
        d="M28 14.5l-9-1.5-5-8H11l2.5 8-7 1L4.5 12H3l1 4-1 4h1.5l2-2 7 1L11 27h3l5-8 9-1.5c1.5-.25 2.5-1 2.5-2s-1-1.75-2.5-2z"
        fill="none"
        stroke={PLANE_COLOR}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        transform="rotate(-28 16 16)"
      />
    </Svg>
  );
}

// ─── Agenda icon (suitcase with diamond) ─────────────────────────────────────
function MyTripsIcon({ focused }: { focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <View style={styles.iconWrap}>
      <ActivePill focused={focused} />
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {/* Suitcase body */}
        <Rect x={3} y={8} width={18} height={13} rx={2} stroke={color} strokeWidth={1.8} />
        {/* Handle */}
        <Path
          d="M9 8V6a3 3 0 0 1 6 0v2"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        {/* Center divider line */}
        <Line x1={3} y1={14} x2={21} y2={14} stroke={color} strokeWidth={1.4} />
        {/* Diamond gem in center */}
        <Path
          d="M12 11l2 3-2 3-2-3z"
          stroke={color}
          strokeWidth={1.4}
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

// ─── Profile icon (head + body silhouette) ──────────────────────────────────
function ProfileIcon({ focused }: { focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <View style={styles.iconWrap}>
      <ActivePill focused={focused} />
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {/* Head circle */}
        <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={1.8} />
        {/* Shoulders / body arc */}
        <Path
          d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function AlertsIcon({ focused }: { focused: boolean }) {
  const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <View style={styles.iconWrap}>
      <ActivePill focused={focused} />
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {/* Bell body */}
        <Path
          d="M6 9a6 6 0 1 1 12 0c0 4 1.2 5.4 2 6.2H4c.8-.8 2-2.2 2-6.2z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {/* Clapper */}
        <Path
          d="M10 18.5a2 2 0 0 0 4 0"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ─── Center FAB button ───────────────────────────────────────────────────────
function ExploreFAB({
  onPress,
  children,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.fabContainer}>
      <View style={styles.fabCircle}>
        <PlaneIcon />
      </View>
      {/* Render the label that React Navigation injects (we hide it via opacity) */}
      <View style={styles.fabLabelWrap}>{children}</View>
    </TouchableOpacity>
  );
}

// ─── Main Tabs ───────────────────────────────────────────────────────────────
function MainTabs() {
  // Respect the bottom safe-area (home indicator). The bar BACKGROUND extends to
  // the very bottom of the screen, while the icons + labels sit just above the
  // home indicator — matching image/Navi-bar.jpg, where the bar hugs the bottom.
  // Previously paddingBottom:0 ignored the inset, leaving the labels floating
  // with a gap below them on notched devices.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName={DEV_FORCE_MAIN ? 'MyTrips' : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -2,
          marginBottom: 4,
        },
        tabBarStyle: {
          // Bar height = content + safe-area; content padding keeps the icons +
          // labels low (close to the bottom, like image/Navi-bar.jpg) while a
          // small clearance keeps the labels off the home indicator.
          height: TAB_BAR_HEIGHT + insets.bottom,
          backgroundColor: colors.navBar,
          borderTopWidth: 1,
          borderTopColor: colors.navBorder,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom - 14, 4),
        },
        tabBarShowLabel: true,
      }}>

      {/* ── Home ── */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarAccessibilityLabel: 'tab-home', // stable target for UI tests (Maestro)
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarIcon: ({ focused }) => <HomeIcon focused={focused} />,
        }}
      />

      {/* ── Trip Trade (was Sign On) ── */}
      <Tab.Screen
        name="FlightStatus"
        component={MyDutyScreen}
        options={{
          tabBarLabel: 'Trip Trade',
          tabBarAccessibilityLabel: 'tab-trip-trade', // stable target for UI tests (Maestro)
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: -2,
            marginBottom: 4,
          },
          tabBarIcon: ({ focused }) => <TripTradeTabIcon focused={focused} />,
        }}
      />

      {/* ── Explore (center FAB) ── */}
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explore',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: -2,
            marginBottom: 4,
          },
          // No icon — the FAB button renders its own plane icon
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <ExploreFAB
              onPress={
                props.onPress
                  ? (e: GestureResponderEvent) => props.onPress!(e as never)
                  : undefined
              }>
              {props.children}
            </ExploreFAB>
          ),
        }}
      />

      {/* ── Agenda ── */}
      <Tab.Screen
        name="MyTrips"
        component={TravelScreen}
        options={{
          tabBarLabel: 'Agenda',
          tabBarAccessibilityLabel: 'tab-agenda', // stable target for UI tests (Maestro)
          tabBarIcon: ({ focused }) => <MyTripsIcon focused={focused} />,
        }}
      />

      {/* ── Alerts ── */}
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarAccessibilityLabel: 'tab-alerts', // stable target for UI tests (Maestro)
          tabBarIcon: ({ focused }) => <AlertsIcon focused={focused} />,
        }}
      />

      {/* ── Profile ── */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarAccessibilityLabel: 'tab-profile', // stable target for UI tests (Maestro)
          tabBarIcon: ({ focused }) => <ProfileIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 36,
  },
  fabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    // No marginBottom — the circle is absolute-positioned so the label sits at
    // the natural tab-bar baseline, aligned with Home / Sign On / Agenda / Profile.
  },
  fabCircle: {
    position: 'absolute',
    // Float the circle above the bar independently of the label.
    bottom: FAB_LIFT,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.fabBg,
    alignItems: 'center',
    justifyContent: 'center',
    // Drop shadow
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabLabelWrap: {
    marginTop: 2,
  },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
});

// ─── Root Navigator ──────────────────────────────────────────────────────────
// Conditional flow (doc/App Flow Ver1): while the persisted session is being
// restored show a splash; then either the auth stack (Login → Capture) or the
// main tabs, switched purely by auth.loggedIn.
export function RootNavigator() {
  const hydrated = useAppSelector(s => s.auth.hydrated);
  const loggedIn = useAppSelector(s => s.auth.loggedIn);

  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {loggedIn || DEV_FORCE_MAIN ? (
        <Stack.Screen name="Main" component={USE_V2 ? V2Navigator : MainTabs} />
      ) : DEV_AUTOSTART_CAPTURE ? (
        // TEMP (sim autotest): boot straight into the portal capture, no login tap.
        <Stack.Screen
          name="Capture"
          component={LoginCaptureScreen}
          initialParams={{ airline: 'TG', crewId: '35459', password: 'Pier2026', keepLogin: false }}
        />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="EkRoster" component={EkRosterLoginScreen} />
          <Stack.Screen name="Capture" component={LoginCaptureScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
