// Route params for the v2 (mock-mirror) navigator.
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

export type V2TabParamList = {
  Home: undefined;
  Schedule: undefined;
  Global: undefined;
  Profile: undefined;
};

export type SpecPageId =
  | 'status' | 'checkin' | 'absence' | 'swap' | 'more' | 'trade' | 'pdf' | 'docs' | 'leave' | 'expense'
  | 'privacy' | 'help' | 'settings' | 'lang' | 'limits';

export type V2StackParamList = {
  Tabs: undefined;
  Alerts: undefined;
  TripDetails: { tripId: string };
  UpcomingAlarms: undefined;
  AlarmsSettings: undefined;
  TimeZone: undefined;
  Preferences: undefined;
  PersonalInfo: undefined;
  Spec: { id: SpecPageId };
};

export type V2Nav = NativeStackNavigationProp<V2StackParamList>;
export function useV2Nav(): V2Nav {
  return useNavigation<V2Nav>();
}
