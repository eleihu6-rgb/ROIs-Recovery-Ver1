// v2 (mock-mirror) navigation: 4-tab pill dock + full-screen pages pushed on
// a native stack (slide in from the right). The carrier palette is provided
// once here — the crew's Appearance choice if they made one, otherwise the
// logged-in airline's own colour (carrier.resolveTheme).
import React from 'react';
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
import type { V2StackParamList, V2TabParamList } from './nav';

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
  return (
    <CarrierContext.Provider value={palette}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen
          name="RBot"
          component={RBotScreen}
          // Slides in from the right like every other pushed page (Ryan,
          // 2026-09-11). Full-height card, NOT a modal: a modal is inset from the
          // top, so KeyboardAvoidingView over-pads and the composer hides behind
          // the keyboard — the crew could not see what they typed.
          options={{ animation: 'slide_from_right' }}
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
      </Stack.Navigator>
    </CarrierContext.Provider>
  );
}
