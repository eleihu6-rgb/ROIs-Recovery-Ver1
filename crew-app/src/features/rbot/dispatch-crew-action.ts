// The "hands" half of R'Bot: turn a semantic action from ai-server into a real
// navigation or state change. Everything phone-local (which trip is next, which
// month the roster view opens on, which theme id a colour name means) is
// resolved here — the model only said *what* it meant.
//
// Returns the confirmation chip shown under the assistant's reply, or null when
// nothing could be applied (e.g. "show my next trip" with an empty roster). A
// null keeps the assistant's words as the only output rather than faking a
// success.
import type { AppDispatch, RootState } from '../../store';
import { reconcileAlarms, setAgendaFilter, setEnabled, setGlobalAlarmHours } from '../alarms/alarmsSlice';
import {
  setAvatarIndex,
  setExplorePrefs,
  setTimeZoneMode,
  setThemePreset,
  type TimeZoneMode,
} from '../settings/settingsSlice';
import { THEME_LABELS, THEME_PRESETS, type ThemePreset } from '../../theme/carrier';
import { nextTrip } from '../v2/model';
import type { V2Nav } from '../v2/nav';
import type { RbotAction } from './types';

export interface RbotDispatchDeps {
  navigation: V2Nav;
  dispatch: AppDispatch;
  getState: () => RootState;
  /** Injectable clock so "next trip" is deterministic in tests. */
  now?: Date;
}

const CHARACTERS = [
  'robot', 'cat', 'bear', 'bunny', 'fox', 'panda', 'owl', 'penguin', 'alien', 'astronaut',
] as const;

/** Free-text colour name → theme preset. The model is asked for a preset id, but
 *  a crew says "purple", so the common words are honoured instead of dropped. */
export function themeFromValue(value: string | number): ThemePreset | null {
  if (typeof value === 'number') {
    return THEME_PRESETS[value] ?? null;
  }
  const v = value.trim().toLowerCase();
  const byId = THEME_PRESETS.find(p => p === v);
  if (byId) return byId;
  const byLabel = THEME_PRESETS.find(p => THEME_LABELS[p].toLowerCase() === v);
  if (byLabel) return byLabel;
  if (v.includes('emerald') || v.includes('green')) return 'emerald';
  if (v.includes('violet') || v.includes('purple') || v.includes('thai')) return 'thai';
  if (v.includes('blue') || v.includes('reference') || v.includes('sia')) return 'sia';
  if (v.includes('graphite') || v.includes('grey') || v.includes('gray') || v.includes('dark')) return 'graphite';
  return null;
}

function timeZoneFromValue(value: string | number): TimeZoneMode | null {
  const v = String(value).trim().toLowerCase();
  if (v === 'airport' || v === 'airports' || v === 'local') return 'airport';
  if (v === 'base' || v === 'home') return 'base';
  if (v === 'utc' || v === 'gmt' || v === 'z') return 'utc';
  if (v === 'device' || v === 'phone') return 'device';
  return null;
}

/** Avatar picked by name ("the fox one") or by position in the picker. */
export function avatarIndexFromValue(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const v = value.trim().toLowerCase();
  const idx = CHARACTERS.findIndex(c => c === v || v.includes(c));
  return idx >= 0 ? idx : null;
}

/**
 * Applies one parsed action. `label` is the chip text the chat shows; null means
 * "nothing to do" (unknown target already filtered out upstream, or no next trip).
 */
export async function dispatchCrewAction(
  action: RbotAction,
  deps: RbotDispatchDeps,
): Promise<string | null> {
  const { navigation, dispatch, getState, now = new Date() } = deps;

  switch (action.type) {
    case 'navigate': {
      switch (action.target) {
        case 'home':
          navigation.navigate('Tabs', {screen: 'Home'});
          return action.label ?? 'Opened Home';
        case 'explore':
          navigation.navigate('Tabs', {screen: 'Home'});
          return action.label ?? 'Opened Explore';
        case 'global':
          navigation.navigate('Tabs', {screen: 'Global'});
          return action.label ?? 'Opened Global';
        case 'profile':
          navigation.navigate('Tabs', {screen: 'Profile'});
          return action.label ?? 'Opened Profile';
        case 'schedule':
          navigation.navigate('Tabs', {screen: 'Schedule', params: {view: 'timeline'}});
          return action.label ?? 'Opened Schedule';
        case 'timeline':
          navigation.navigate('Tabs', {screen: 'Schedule', params: {view: 'timeline', viewAt: Date.now()}});
          return action.label ?? 'Opened the timetable';
        case 'roster_calendar':
          navigation.navigate('Tabs', {screen: 'Schedule', params: {view: 'calendar-compact', viewAt: Date.now()}});
          return action.label ?? 'Opened your roster calendar';
        case 'route_map':
          navigation.navigate('Tabs', {screen: 'Schedule', params: {view: 'route', viewAt: Date.now()}});
          return action.label ?? 'Opened your route map';
        case 'alerts':
          navigation.navigate('Alerts');
          return action.label ?? 'Opened Alerts';
        case 'upcoming_alarms':
          navigation.navigate('UpcomingAlarms');
          return action.label ?? 'Opened Upcoming alarms';
        case 'alarm_settings':
          navigation.navigate('AlarmsSettings');
          return action.label ?? 'Opened alarm settings';
        case 'time_zone':
          navigation.navigate('TimeZone');
          return action.label ?? 'Opened time zone';
        case 'preferences':
          navigation.navigate('Preferences');
          return action.label ?? 'Opened Preferences';
        case 'appearance':
          navigation.navigate('Appearance');
          return action.label ?? 'Opened Appearance';
        case 'personal_info':
          navigation.navigate('PersonalInfo');
          return action.label ?? 'Opened Personal info';
        case 'help':
          navigation.navigate('Spec', {id: 'help'});
          return action.label ?? 'Opened Help';
        case 'absence':
          navigation.navigate('Spec', {id: 'absence'});
          return action.label ?? 'Opened Absence request';
        case 'next_trip':
        case 'trip_details': {
          const trips = getState().trips.trips;
          const wanted = action.tripId
            ? trips.find(t => t.id === action.tripId)
            : nextTrip(trips, now);
          if (!wanted) return null;
          navigation.navigate('TripDetails', {tripId: wanted.id});
          return action.label ?? 'Opened that trip';
        }
        default:
          return null;
      }
    }

    case 'request_absence': {
      // Never submits: opens the real form, pre-filled, for the crew to confirm.
      navigation.navigate('Spec', {
        id: 'absence',
        absenceFrom: action.fromDate,
        absenceTo: action.toDate,
        ...(action.note ? {absenceNote: action.note} : {}),
      });
      return action.label ?? 'Prepared your absence request — review and submit';
    }

    case 'set_alarm': {
      const alarms = getState().alarms;
      switch (action.action) {
        case 'enable':
          await dispatch(setEnabled(true));
          await dispatch(reconcileAlarms());
          return action.label ?? 'Alarms on';
        case 'disable':
          await dispatch(setEnabled(false));
          await dispatch(reconcileAlarms());
          return action.label ?? 'Alarms off';
        case 'set_offsets': {
          const wakeUpHours = action.wakeUpHours ?? alarms.wakeUpHours;
          const leaveHomeHours = action.leaveHomeHours ?? alarms.leaveHomeHours;
          if (action.wakeUpHours === undefined && action.leaveHomeHours === undefined) {
            return null;
          }
          if (wakeUpHours < 0 || leaveHomeHours < 0) return null;
          await dispatch(setGlobalAlarmHours({wakeUpHours, leaveHomeHours}));
          await dispatch(reconcileAlarms());
          return action.label ?? `Alarms set to ${wakeUpHours}h wake-up / ${leaveHomeHours}h leave home`;
        }
        case 'set_agenda_filter': {
          if (!action.filter) return null;
          await dispatch(setAgendaFilter(action.filter));
          await dispatch(reconcileAlarms());
          return action.label ?? `Showing ${action.filter} events`;
        }
        default:
          return null;
      }
    }

    case 'change_setting': {
      switch (action.setting) {
        case 'time_zone_mode': {
          const mode = timeZoneFromValue(action.value as string | number);
          if (!mode) return null;
          await dispatch(setTimeZoneMode(mode));
          return action.label ?? `Times shown in ${mode === 'device' ? 'phone local' : mode} time`;
        }
        case 'theme': {
          const preset = themeFromValue(action.value as string | number);
          if (!preset) return null;
          await dispatch(setThemePreset(preset));
          return action.label ?? `Theme set to ${THEME_LABELS[preset]}`;
        }
        case 'avatar': {
          const index = avatarIndexFromValue(action.value as string | number);
          if (index === null) return null;
          await dispatch(setAvatarIndex(index));
          return action.label ?? 'Avatar updated';
        }
        case 'explore_interests': {
          const value = action.value;
          if (!Array.isArray(value)) return null;
          const prefs = value.map(v => String(v).trim().toLowerCase()).filter(Boolean);
          if (prefs.length === 0) return null;
          await dispatch(setExplorePrefs(prefs));
          return action.label ?? 'Explore interests updated';
        }
        default:
          return null;
      }
    }

    default:
      return null;
  }
}
