// v2 (mock-mirror) navigation: 4-tab pill dock + full-screen pages pushed on
// a native stack (slide in from the right). The carrier palette is provided
// once here — the crew's Appearance choice if they made one, otherwise the
// logged-in airline's own colour (carrier.resolveTheme).
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import { CarrierContext, paletteFor, resolveTheme } from '../../theme/carrier';
import { PillDock } from '../../components/v2/PillDock';
import { HomeScreen } from './HomeScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { GlobalScreen } from './GlobalScreen';
import { ProfileScreen } from './ProfileScreen';
import { SpecPage } from './SpecPage';
import { AbsenceHistoryScreen } from './AbsenceHistoryScreen';
import { DiscretionScreen } from './DiscretionScreen';
import { TripDetailsScreen } from './TripDetailsScreen';
import { DestinationScreen } from './DestinationScreen';
import { UpcomingAlarmsScreen } from './UpcomingAlarmsScreen';
import { AlarmsSettingsScreen } from './AlarmsSettingsScreen';
import { TimeZoneScreen } from './TimeZoneScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { AppearanceScreen } from './AppearanceScreen';
import { PersonalInfoScreen } from './PersonalInfoScreen';
import { NotificationsScreen } from '../notifications/NotificationsScreen';
import { RBotScreen } from '../rbot/RBotScreen';
import { RBotEntry } from '../rbot/RBotEntry';
import { sourceFromRoute } from '../rbot/pageContext';
import { DutySwapHost } from '../dutySwap/market/DutySwapHost';
import { DutySwapRecordsScreen } from '../dutySwap/DutySwapRecordsScreen';
import { DutySwapMyDutiesScreen } from '../dutySwap/DutySwapMyDutiesScreen';
import { MealScreen } from '../meal/MealScreen';
import { CheckInScreen } from '../checkIn/CheckInScreen';
import type { V2Nav, V2StackParamList, V2TabParamList } from './nav';
import { useLayout } from '../../components/v2/useLayout';

const Tab = createBottomTabNavigator<V2TabParamList>();
const Stack = createNativeStackNavigator<V2StackParamList>();

function Tabs() {
  const p = React.useContext(CarrierContext);
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={props => <PillDock {...props} palette={p} />}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ tabBarLabel: 'Schedule' }} />
      <Tab.Screen name="Global" component={GlobalScreen} options={{ tabBarLabel: 'Global' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

export function V2Navigator() {
  // Brand/theme with the carrier the crew actually flies when the roster said so
  // (crew K1003 = EK, even though the ROIS roster service is reached through the
  // ET option); otherwise the signed-in airline stays the carrier.
  const carrier = useAppSelector(selectCrewCarrier);
  const chosenTheme = useAppSelector(s => s.settings.themePreset);
  const palette = paletteFor(resolveTheme(chosenTheme, carrier));
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const stackNav = React.useRef<V2Nav | null>(null);
  const [active, setActive] = React.useState<{ name: string; params?: Record<string, unknown> }>({ name: 'Tabs' });
  const dutySwapApproach = useAppSelector(s => s.rbot.dutySwapApproach);
  const showLauncher = !['Tabs', 'RBot'].includes(active.name)
    && (active.name !== 'DutySwap' || dutySwapApproach !== 'matrix');
  return (
    <CarrierContext.Provider value={palette}>
      <StatusBar barStyle={palette.isLight ? 'dark-content' : 'light-content'} />
      <View style={styles.fill}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        screenListeners={({ navigation, route }) => ({
          focus: () => {
            stackNav.current = navigation as V2Nav;
            setActive({ name: route.name, params: route.params as Record<string, unknown> | undefined });
          },
        })}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen
          name="RBot"
          component={RBotScreen}
          // Transparent modal keeps the originating page mounted behind R'Bot's
          // compact panel; RBotScreen positions the composer above the keyboard.
          options={{ animation: 'fade', presentation: 'transparentModal' }}
        />
        <Stack.Screen name="Alerts" component={NotificationsScreen} />
        <Stack.Screen name="TripDetails" component={TripDetailsScreen} />
        <Stack.Screen
          name="Destination"
          component={DestinationScreen}
          options={{ animation: 'fade', presentation: 'card' }}
        />
        <Stack.Screen name="UpcomingAlarms" component={UpcomingAlarmsScreen} />
        <Stack.Screen name="AlarmsSettings" component={AlarmsSettingsScreen} />
        <Stack.Screen name="TimeZone" component={TimeZoneScreen} />
        <Stack.Screen name="Preferences" component={PreferencesScreen} />
        <Stack.Screen name="Appearance" component={AppearanceScreen} />
        <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
        <Stack.Screen name="Spec" component={SpecPage} />
        <Stack.Screen name="AbsenceHistory" component={AbsenceHistoryScreen} />
        <Stack.Screen name="Discretion" component={DiscretionScreen} />
        <Stack.Screen name="DutySwap" component={DutySwapHost} />
        <Stack.Screen name="DutySwapRecords" component={DutySwapRecordsScreen} />
        <Stack.Screen name="DutySwapMyDuties" component={DutySwapMyDutiesScreen} />
        <Stack.Screen name="Meal" component={MealScreen} />
        <Stack.Screen name="CheckIn" component={CheckInScreen} />
      </Stack.Navigator>
      {showLauncher ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.launcher, {
            right: wide ? Math.max(10, (insets.right - 44) / 2) : 20,
            bottom: Math.max(insets.bottom, 16) + 16,
          }]}>
            <RBotEntry palette={palette} onLight={palette.isLight} variant={wide ? 'rail' : 'dock'}
              onPress={() => stackNav.current?.navigate('RBot', { source: sourceFromRoute(active.name, active.params) })} />
          </View>
        </View>
      ) : null}
      </View>
    </CarrierContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  launcher: { position: 'absolute' },
});
