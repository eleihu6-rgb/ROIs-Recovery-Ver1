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

export type RbotAction =
  | RbotNavigateAction
  | RbotAbsenceAction
  | RbotAlarmAction
  | RbotSettingAction;

/** Phone-local facts the model needs but cannot guess. */
export interface RbotContext {
  airline: string;
  crewId: string;
  crewName?: string;
  /** Crew-base local date, 'YYYY-MM-DD' — anchors "tomorrow", "next Monday". */
  today: string;
  /** Screen the crew asked from (tone/context only). */
  screen?: string;
}

export interface RbotChatResponse {
  role: 'assistant';
  content: string;
  actions: RbotAction[];
}

/** A thread entry plus the confirmation chips of the actions that were applied. */
export interface RbotThreadEntry extends RbotChatMessage {
  applied?: string[];
}
