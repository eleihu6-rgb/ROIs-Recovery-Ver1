import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppDispatch, RootState } from '../../store';
import { classifyTrips } from '../travel/tripCsv';
import {
  DEFAULT_ALARM_OPTIONS,
  alarmOptions,
  computeEffectiveAlarms,
} from '../settings/alarmSetup';
import {
  isAlarmModuleAvailable,
  requestAlarmAuthorization,
  removeAllAlarms,
  scheduleEffectiveAlarms,
} from '../settings/alarmModule';
import { computeMeetingAlarms } from '../meetings/meetingSetup';
import type { EffectiveAlarm } from '../settings/alarmSetup';

export interface DutyAlarmOverride {
  wakeUpHours: number | null;    // null = alarm removed for this duty
  leaveHomeHours: number | null; // null = alarm removed for this duty
}

/** Controls which event category receives alarms and is shown in the Agenda tab. */
export type AgendaFilter = 'all' | 'work' | 'personal';

interface AlarmsState {
  enabled: boolean;
  // Global Wake Up / Leave Home offsets (hours before departure), user-editable.
  // Duties without a per-duty override follow these.
  wakeUpHours: number;
  leaveHomeHours: number;
  overrides: Record<string, DutyAlarmOverride>; // keyed by trip/duty id
  /** Agenda filter: which events to display and arm alarms for. */
  agendaFilter: AgendaFilter;
}

const ENABLED_KEY = '@royce_alarms_enabled';
const HOURS_KEY = '@royce_alarms_hours';
const FILTER_KEY = '@royce_agenda_filter';

const initialState: AlarmsState = {
  enabled: false,
  wakeUpHours: DEFAULT_ALARM_OPTIONS.wakeUpHoursBefore,
  leaveHomeHours: DEFAULT_ALARM_OPTIONS.leaveHomeHoursBefore,
  overrides: {},
  agendaFilter: 'all',
};

const alarmsSlice = createSlice({
  name: 'alarms',
  initialState,
  reducers: {
    _setEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    _setGlobalHours(
      state,
      action: PayloadAction<{ wakeUpHours: number; leaveHomeHours: number }>,
    ) {
      state.wakeUpHours = action.payload.wakeUpHours;
      state.leaveHomeHours = action.payload.leaveHomeHours;
    },
    _setAgendaFilter(state, action: PayloadAction<AgendaFilter>) {
      state.agendaFilter = action.payload;
    },
    setDutyOverride(
      state,
      action: PayloadAction<{ dutyId: string; override: DutyAlarmOverride }>,
    ) {
      state.overrides[action.payload.dutyId] = action.payload.override;
    },
    resetDutyOverride(state, action: PayloadAction<string>) {
      delete state.overrides[action.payload];
    },
  },
});

export const { setDutyOverride, resetDutyOverride } = alarmsSlice.actions;

export interface ReconcileResult {
  available: boolean;
  scheduled: number;
  skippedPast: number;
}

/**
 * The single entry point for getting iOS alarms in sync with app state. Reads
 * the current enabled flag, global offsets, per-duty overrides and stored trips,
 * then makes the device match:
 *   • module unavailable (Android / iOS < 26) → no-op
 *   • disabled                                → remove every alarm
 *   • enabled                                 → clear, then schedule one Wake Up +
 *     Leave Home alarm per upcoming duty in the departure airport's local time.
 * scheduleEffectiveAlarms wipes all native alarms first, so every call is a full
 * "remove and reset" — flights dropped by a roster reload lose their alarms, and
 * an offset change reschedules cleanly with no duplicates.
 *
 * Flight alarms (state.alarms.enabled) and meeting alarms (state.meetings.enabled)
 * are independent sources combined into one schedule, so either can be on alone.
 */
export function reconcileAlarms() {
  return async (
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ReconcileResult> => {
    if (!isAlarmModuleAvailable()) {
      return { available: false, scheduled: 0, skippedPast: 0 };
    }
    const { enabled, wakeUpHours, leaveHomeHours, overrides, agendaFilter } = getState().alarms;
    const meetings = getState().meetings;
    const scheduleWork = agendaFilter === 'all' || agendaFilter === 'work';
    const schedulePersonal = agendaFilter === 'all' || agendaFilter === 'personal';
    if ((!enabled || !scheduleWork) && (!meetings.enabled || !schedulePersonal)) {
      // Nothing to schedule from either source — clear everything.
      await removeAllAlarms();
      return { available: true, scheduled: 0, skippedPast: 0 };
    }
    const auth = await requestAlarmAuthorization();
    if (auth !== 'authorized') {
      // Permission refused — make sure nothing lingers, then report nothing set.
      await removeAllAlarms();
      return { available: true, scheduled: 0, skippedPast: 0 };
    }
    const effective: EffectiveAlarm[] = [];
    if (enabled && scheduleWork) {
      const upcoming = classifyTrips(getState().trips.trips, new Date()).upcoming;
      effective.push(
        ...computeEffectiveAlarms(
          upcoming,
          alarmOptions(wakeUpHours, leaveHomeHours),
          overrides,
        ),
      );
    }
    if (meetings.enabled && schedulePersonal) {
      effective.push(
        ...computeMeetingAlarms(
          meetings.meetings,
          meetings.minutesBefore,
          new Date(),
          new Set(meetings.mutedIds),
        ),
      );
    }
    const { scheduled, skippedPast } = await scheduleEffectiveAlarms(effective);
    return { available: true, scheduled, skippedPast };
  };
}

// Thunks — persist enabled state to AsyncStorage, then sync the device alarms so
// flipping the switch auto-sets (on) or auto-removes (off) every flight's alarms.
export function setEnabled(enabled: boolean) {
  return async (dispatch: AppDispatch): Promise<ReconcileResult> => {
    dispatch(alarmsSlice.actions._setEnabled(enabled));
    try {
      await AsyncStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
    } catch {}
    return dispatch(reconcileAlarms());
  };
}

/** Change the global Wake Up / Leave Home offsets, persist them, and reschedule. */
export function setGlobalAlarmHours(hours: { wakeUpHours: number; leaveHomeHours: number }) {
  return async (dispatch: AppDispatch): Promise<ReconcileResult> => {
    dispatch(alarmsSlice.actions._setGlobalHours(hours));
    try {
      await AsyncStorage.setItem(HOURS_KEY, JSON.stringify(hours));
    } catch {}
    return dispatch(reconcileAlarms());
  };
}

/** Change the agenda filter scope, persist it, and reschedule alarms to match. */
export function setAgendaFilter(filter: AgendaFilter) {
  return async (dispatch: AppDispatch): Promise<void> => {
    dispatch(alarmsSlice.actions._setAgendaFilter(filter));
    try {
      await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {}
    dispatch(reconcileAlarms());
  };
}

export function loadEnabled() {
  return async (dispatch: AppDispatch) => {
    try {
      const val = await AsyncStorage.getItem(ENABLED_KEY);
      if (val !== null) {
        dispatch(alarmsSlice.actions._setEnabled(JSON.parse(val)));
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(HOURS_KEY);
      if (raw !== null) {
        const h = JSON.parse(raw);
        if (typeof h?.wakeUpHours === 'number' && typeof h?.leaveHomeHours === 'number') {
          dispatch(alarmsSlice.actions._setGlobalHours(h));
        }
      }
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(FILTER_KEY);
      if (raw !== null) {
        const f = JSON.parse(raw);
        if (f === 'all' || f === 'work' || f === 'personal') {
          dispatch(alarmsSlice.actions._setAgendaFilter(f));
        }
      }
    } catch {}
  };
}

export default alarmsSlice.reducer;
