// Route params for the v2 (mock-mirror) navigator.
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

export type V2TabParamList = {
  Home: undefined;
  /** `view` is how R'Bot (or any other entry point) opens a specific roster
   *  view; `viewAt` makes a repeat request of the *same* view re-apply after the
   *  crew changed it by hand. */
  Schedule: { view?: 'timeline' | 'calendar-compact' | 'calendar-detail' | 'route'; viewAt?: number } | undefined;
  Global: undefined;
  Profile: undefined;
};

export type SpecPageId =
  | 'status' | 'checkin' | 'absence' | 'swap' | 'more' | 'trade' | 'pdf' | 'docs' | 'leave' | 'expense'
  | 'privacy' | 'help' | 'settings' | 'lang' | 'limits';

export type V2StackParamList = {
  Tabs: NavigatorScreenParams<V2TabParamList> | undefined;
  /** R'Bot — the in-app AI assistant (dock entry, right of the tabs). */
  RBot: undefined;
  Alerts: undefined;
  /** Full-screen city viewer; `index` picks the page inside the destination list. */
  Destination: { index: number };
  TripDetails: { tripId: string };
  UpcomingAlarms: undefined;
  AlarmsSettings: undefined;
  TimeZone: undefined;
  Preferences: undefined;
  Appearance: undefined;
  PersonalInfo: undefined;
  /** `absenceFrom` / `absenceTo` / `absenceNote` pre-fill the Absence form when
   *  R'Bot prepared a request from the conversation — the crew still submits. */
  Spec: { id: SpecPageId; absenceFrom?: string; absenceTo?: string; absenceNote?: string };
};

export type V2Nav = NativeStackNavigationProp<V2StackParamList>;
export function useV2Nav(): V2Nav {
  return useNavigation<V2Nav>();
}
