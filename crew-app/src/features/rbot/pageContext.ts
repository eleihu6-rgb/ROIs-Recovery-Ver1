import type { Trip } from '../travel/tripCsv';
import { nextTrip } from '../v2/model';

/** Route facts captured when the crew opens R'Bot, before the assistant covers the page. */
export interface RbotSource {
  route: string;
  view?: string;
  tripId?: string;
  destinationIndex?: number;
  specId?: string;
}

const PAGE_NAMES: Record<string, string> = {
  Home: 'Home', Schedule: 'Schedule', Global: 'Global', Profile: 'Profile',
  Alerts: 'Alerts', TripDetails: 'Trip Details', Destination: 'Destination',
  UpcomingAlarms: 'Upcoming Alarms', AlarmsSettings: 'Alarm Settings',
  TimeZone: 'Time Zone', Preferences: 'Preferences', Appearance: 'Appearance',
  PersonalInfo: 'Personal Info', AbsenceHistory: 'Absence History',
  Discretion: 'Discretion', DutySwap: 'Duty Swap', DutySwapRecords: 'Duty Swap Records',
  DutySwapMyDuties: 'My Swap Duties', Meal: 'Meal Preferences', CheckIn: 'Check-In',
};

const VIEW_NAMES: Record<string, string> = {
  timeline: 'Timeline', 'calendar-compact': 'Calendar', 'calendar-detail': 'Calendar day',
  route: 'Route Map',
};

/** Labels are controls the crew can actually see/use, not promises that R'Bot
 * can press them. The server distinguishes these from its action tools. */
const PAGE_CONTROLS: Record<string, string[]> = {
  Home: ['Open upcoming trip details', 'Open a destination', 'Check-In', 'Absence', 'Discretion', 'Duty Swap', 'Meal', 'Alerts', 'Upcoming Alarms'],
  Schedule: ['Previous month', 'Next month', 'Choose Timeline, Calendar, Calendar day or Route Map view', 'Open a duty', 'Open Alerts'],
  Alerts: ['Open an alert', 'Review alert details', 'Retry loading if needed'],
  Profile: ['Change avatar', 'Personal Information', 'Alarms & Meetings', 'Time Zone', 'Preferences', 'Privacy & Security', 'Help & Support', 'Log Out'],
  Preferences: ['Toggle push notifications', 'Toggle roster changes', 'Open Appearance', 'Choose destination interests', 'Toggle iOS Calendar sync'],
  Appearance: ['Choose colour theme', 'Use airline default'],
  TimeZone: ['Choose Airport Local, Base time, UTC or Phone Local Time', 'Explain time format markers'],
  TripDetails: ['Review flight legs and trip details'],
  Destination: ['Swipe to another destination', 'Review flight and booked hotel details'],
  AbsenceHistory: ['Review absence requests', 'Retry loading if needed'],
  Discretion: ['Review discretion requests', 'Retry loading if needed'],
  UpcomingAlarms: ['Toggle iOS clock alarms', 'Open Alarm settings', 'Review upcoming alarms'],
  AlarmsSettings: ['Toggle flight alarms', 'Change alarm offsets', 'Toggle meeting alarms', 'Toggle Dynamic Island countdown'],
  DutySwapRecords: ['Review swap requests', 'Withdraw a sent request when allowed', 'Accept or decline a received request when allowed'],
  DutySwapMyDuties: ['Unlock or lock individual duties', 'Change automatic unlocking', 'Save changes'],
  Meal: ['Choose meal type', 'Set start and end dates', 'Save a meal preference', 'Remove a saved preference'],
  CheckIn: ['Review check-in time window', 'Check in when eligible'],
};

export interface PageFacts {
  scheduleMonth?: string;
  scheduleDay?: number | null;
  timeZoneMode?: string;
  baseTimeZone?: string;
  theme?: string;
  explorePrefs?: string[];
  calendarSync?: boolean;
  alertCount?: number;
  alarmsEnabled?: boolean;
  dutySwap?: { approach: string; step: string; status: string; window?: { start: string; end: string }; crewCount: number; selectedCrew?: string | null };
}

export function sourceFromRoute(name: string, params?: Record<string, unknown>): RbotSource {
  const source: RbotSource = { route: name };
  if (name === 'Schedule' && typeof params?.view === 'string') source.view = params.view;
  if (name === 'TripDetails' && typeof params?.tripId === 'string') source.tripId = params.tripId;
  if (name === 'Destination' && typeof params?.index === 'number') source.destinationIndex = params.index;
  if (name === 'Spec' && typeof params?.id === 'string') source.specId = params.id;
  return source;
}

export function pageContext(source: RbotSource | undefined, trips: Trip[], facts: PageFacts = {}): { screen: string; page: Record<string, unknown> } {
  const route = source?.route ?? 'Home';
  const view = source?.view;
  const screen = route === 'Spec'
    ? `${source?.specId ?? 'App'} page`
    : `${PAGE_NAMES[route] ?? route}${view ? ` · ${VIEW_NAMES[view] ?? view}` : ''}`;
  const page: Record<string, unknown> = { route, ...(view ? { view } : {}) };
  if (PAGE_CONTROLS[route]) page.controls = PAGE_CONTROLS[route];
  if (route === 'Home') {
    const upcoming = nextTrip(trips, new Date());
    if (!upcoming) page.controls = (page.controls as string[]).filter(c => c !== 'Open upcoming trip details');
    page.upcomingTrip = upcoming ? { id: upcoming.id, firstFlight: upcoming.legs[0]?.fltNumber,
      departureUtc: upcoming.legs[0]?.flightDateUTC } : null;
    if (facts.alertCount !== undefined) page.alertCount = facts.alertCount;
    if (facts.alarmsEnabled !== undefined) page.alarmsEnabled = facts.alarmsEnabled;
  }
  if (route === 'Global') page.status = 'Coming soon; no page controls yet';
  if (route === 'Alerts' && facts.alertCount !== undefined) page.alertCount = facts.alertCount;
  if (route === 'Schedule') {
    if (facts.scheduleMonth) page.month = facts.scheduleMonth;
    if (facts.scheduleDay != null) page.selectedDay = facts.scheduleDay;
  }
  if (route === 'Profile' || route === 'TimeZone') {
    if (facts.timeZoneMode) page.timeZoneMode = facts.timeZoneMode;
    if (facts.baseTimeZone) page.baseTimeZone = facts.baseTimeZone;
  }
  if (route === 'Preferences') {
    if (facts.theme) page.theme = facts.theme;
    if (facts.explorePrefs) page.destinationInterests = facts.explorePrefs;
    if (facts.calendarSync !== undefined) page.calendarSync = facts.calendarSync;
  }
  if (route === 'Appearance' && facts.theme) page.selectedTheme = facts.theme;
  if (route === 'DutySwap' && facts.dutySwap) {
    page.swap = facts.dutySwap;
    page.controls = facts.dutySwap.approach === 'market'
      ? ['Choose a duty to give', 'Filter offers', 'Open an offer', 'Open My duties', 'Open Swap Records']
      : facts.dutySwap.approach === 'ticket'
        ? ['Choose an unlocked duty to give', 'Choose a match', 'Review swap ticket', 'Check legality and send after review', 'Open Swap Records']
        : ['Set search dates and filters', 'Search crew', 'Choose duties to give and take', 'Check legality and send after review'];
  }
  if (source?.specId) page.topic = source.specId;
  if (source?.destinationIndex !== undefined) page.destinationIndex = source.destinationIndex;
  if (source?.tripId) {
    const trip = trips.find(t => t.id === source.tripId);
    if (trip) {
      page.trip = { id: trip.id, legs: trip.legs.map(l => ({
        flight: l.fltNumber, from: l.depArp, to: l.arvArp,
        departureUtc: l.flightDateUTC, arrivalUtc: l.arvDateUTC,
        ...(l.hotel ? { hotel: l.hotel } : {}),
      })) };
    }
  }
  return { screen, page };
}

export function answerPageQuestion(text: string, screen: string, page?: Record<string, unknown>): string | null {
  const question = text.trim();
  if (/^(?:what|which) (?:page|screen) am i on\??$/i.test(question)) return `You're on ${screen}.`;
  if (/^(?:what can i do here|what (?:are|can i use) (?:the )?controls (?:here|on this page)|how can you help me here)\??$/i.test(question)) {
    const controls = page?.controls;
    return Array.isArray(controls) && controls.length
      ? `On ${screen}, you can ${controls.slice(0, 5).map((item: string) => item[0].toLowerCase() + item.slice(1)).join('; ')}. I can help explain or prepare supported actions, but I won't submit anything for you.`
      : `You're on ${screen}. Ask me about what you're trying to do here.`;
  }
  return null;
}
