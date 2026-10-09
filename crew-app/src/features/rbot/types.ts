// R'Bot — the crew app's in-app AI assistant.
//
// Contract mirrors the Gantt RBot split (brain/hands): ai-server turns the
// crew's sentence into { content, actions }, and the app — never the model —
// resolves a *semantic* target against live state and performs the change.
// The model therefore never sees route names, trip ids or list indexes.
// See docs/superpowers/specs/2026-09-11-crew-app-rbot-assistant-design.md §3.

export type RbotChatRole = 'user' | 'assistant';

export interface RbotChatMessage {
  role: RbotChatRole;
  content: string;
}

/** Everything the assistant is allowed to navigate to, named by meaning. */
export type RbotNavTarget =
  | 'home'
  | 'schedule'
  | 'roster_calendar'
  | 'route_map'
  | 'timeline'
  | 'next_trip'
  | 'trip_details'
  | 'explore'
  | 'alerts'
  | 'upcoming_alarms'
  | 'alarm_settings'
  | 'absence'
  | 'time_zone'
  | 'preferences'
  | 'appearance'
  | 'personal_info'
  | 'help'
  | 'global'
  | 'profile';

export interface RbotNavigateAction {
  type: 'navigate';
  target: RbotNavTarget;
  /** 'YYYY-MM' — picks the month a roster view should open on. */
  month?: string;
  /** Trip id when the crew named a specific rotation. */
  tripId?: string;
  label?: string;
}

export interface RbotAbsenceAction {
  type: 'request_absence';
  /** Crew-base local date, 'YYYY-MM-DD'. */
  fromDate: string;
  /** Crew-base local date, 'YYYY-MM-DD', inclusive. */
  toDate: string;
  note?: string;
  label?: string;
}

export type RbotAlarmActionKind = 'enable' | 'disable' | 'set_offsets' | 'set_agenda_filter';

export interface RbotAlarmAction {
  type: 'set_alarm';
  action: RbotAlarmActionKind;
  /** Hours before departure, for `set_offsets`. */
  wakeUpHours?: number;
  leaveHomeHours?: number;
  /** For `set_agenda_filter`. */
  filter?: 'all' | 'work' | 'personal';
  label?: string;
}

export type RbotSettingKey =
  | 'time_zone_mode'
  | 'theme'
  | 'avatar'
  | 'explore_interests';

export interface RbotSettingAction {
  type: 'change_setting';
  setting: RbotSettingKey;
  value: string | number | string[];
  label?: string;
}

/** Duty Swap (Concept D): fields of the portal's Search Pairing form R'Bot may
 *  set. Dates YYYY-MM-DD; hours are whole numbers; times HH:mm. Spec §6. */
export interface RbotSwapSearchFields {
  swapMode?: 'NS' | 'FS';
  startDate?: string;
  endDate?: string;
  durationStart?: string; durationEnd?: string;
  crdStart?: string; crdEnd?: string;
  blhStart?: string; blhEnd?: string;
  briefStart?: string; briefEnd?: string;
  debriefStart?: string; debriefEnd?: string;
  layoverTimeStart?: string; layoverTimeEnd?: string;
  taskTypeList?: string[];
  layoverPortList?: string[];
  fltNumList?: string[];
  fltArrList?: string[];
  fltFleetList?: string[];
  activeRankList?: string[];
  filterEmptyDutyCrew?: boolean;
}

/** Change the Duty Swap search (the app runs it). `reset` clears optional fields first. */
export interface RbotSwapSearchAction {
  type: 'set_swap_search';
  fields: RbotSwapSearchFields;
  reset?: boolean;
  /** What the crew wants in return. Applied on the phone after the search: keep
   *  crews with a swappable duty of this kind in the window. (The portal's Type
   *  filter also filters the crew's OWN duties, so it cannot express this.) */
  wantKind?: 'standby' | 'fly';
  label?: string;
}

/** Change which crews the matrix shows. `addWhere` finds crews by a search
 *  (e.g. a DOH layover) and adds them to the ones already shown. */
export interface RbotSwapCrewsAction {
  type: 'set_swap_crews';
  only?: string[];
  add?: string[];
  remove?: string[];
  addWhere?: RbotSwapSearchFields;
  label?: string;
}

/** Pick duties in the matrix (never submits). `code` matches the duty code
 *  ('PR124/PR125', '1HB'); `date` (YYYY-MM-DD) is any day the duty covers. */
export interface RbotSwapSelectAction {
  type: 'select_swap_duties';
  give?: { date?: string; code?: string }[];
  take?: { crewId: string; date?: string; code?: string }[];
  label?: string;
}

export type RbotSwapAction = RbotSwapSearchAction | RbotSwapCrewsAction | RbotSwapSelectAction;

export type RbotAction =
  | RbotNavigateAction
  | RbotAbsenceAction
  | RbotAlarmAction
  | RbotSettingAction
  | RbotSwapAction;

/** Phone-local facts the model needs but cannot guess. */
export interface RbotContext {
  airline: string;
  crewId: string;
  crewName?: string;
  /** Crew-base local date, 'YYYY-MM-DD' — anchors "tomorrow", "next Monday". */
  today: string;
  /** Screen the crew asked from (tone/context only). */
  screen?: string;
  /** Active page and its visible identifiers when this turn was sent. */
  page?: Record<string, unknown>;
  /** Duty Swap screen snapshot — what R'Bot "sees" (spec §6). Only sent from that screen. */
  swap?: unknown;
}

export interface RbotChatResponse {
  role: 'assistant';
  content: string;
  actions: RbotAction[];
}

/** A thread entry plus the confirmation chips of the actions that were applied. */
export interface RbotThreadEntry extends RbotChatMessage {
  applied?: string[];
  /** True when R'Bot answered from the roster on the phone — nothing was sent. */
  local?: boolean;
}
