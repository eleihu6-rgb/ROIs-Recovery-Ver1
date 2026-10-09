import { answerPageQuestion, pageContext, sourceFromRoute } from '../../src/features/rbot/pageContext';
import type { Trip } from '../../src/features/travel/tripCsv';

describe("R'Bot page context", () => {
  it('names every app route and the selected Schedule view', () => {
    const routes = ['Home', 'Global', 'Profile', 'Alerts', 'TripDetails', 'Destination',
      'UpcomingAlarms', 'AlarmsSettings', 'TimeZone', 'Preferences', 'Appearance',
      'PersonalInfo', 'AbsenceHistory', 'Discretion', 'DutySwap', 'DutySwapRecords',
      'DutySwapMyDuties', 'Meal', 'CheckIn'];
    for (const route of routes) {
      const context = pageContext(sourceFromRoute(route), []);
      expect(context.screen).not.toBe('RBot');
      expect(context.page.route).toBe(route);
    }
    expect(pageContext({ route: 'Schedule', view: 'route' }, []).screen).toBe('Schedule · Route Map');
    expect(pageContext({ route: 'Schedule', view: 'calendar-detail' }, []).screen).toBe('Schedule · Calendar day');
    expect(pageContext(sourceFromRoute('Spec', { id: 'help' }), []).screen).toBe('help page');
  });

  it('uses the visible trip from the roster and never invents one', () => {
    const trip = { id: 'trip-1', legs: [{ fltNumber: 'PR124', depArp: 'MNL', arvArp: 'SEA', flightDateUTC: '2026-10-08T12:00:00Z', arvDateUTC: '2026-10-09T02:00:00Z', hotel: 'Test Hotel' }] } as Trip;
    const source = sourceFromRoute('TripDetails', { tripId: 'trip-1' });
    expect(pageContext(source, [trip]).page.trip).toMatchObject({ legs: [{ flight: 'PR124', from: 'MNL', to: 'SEA' }] });
    expect(pageContext(source, []).page.trip).toBeUndefined();
  });

  it('answers a screen question from the captured page', () => {
    expect(answerPageQuestion('Which screen am I on?', 'Schedule · Route Map')).toBe("You're on Schedule · Route Map.");
    const preferences = pageContext({ route: 'Preferences' }, [], {
      theme: 'daylight', explorePrefs: ['culture'], calendarSync: true,
    });
    expect(preferences.page).toMatchObject({
      theme: 'daylight', destinationInterests: ['culture'], calendarSync: true,
      controls: expect.arrayContaining(['Open Appearance', 'Toggle iOS Calendar sync']),
    });
    expect(answerPageQuestion('What can I do here?', preferences.screen, preferences.page))
      .toContain('open Appearance');
    expect(pageContext({ route: 'Schedule', view: 'calendar-detail' }, [],
      {scheduleMonth: '2026-10', scheduleDay: 8}).page)
      .toMatchObject({month: '2026-10', selectedDay: 8});
    expect(pageContext({route: 'DutySwap'}, [], {dutySwap: {
      approach: 'ticket', step: 'pick', status: 'ready', crewCount: 3,
    }}).page.controls).toContain('Review swap ticket');
    expect(answerPageQuestion('find me a trip', 'Schedule')).toBeNull();
  });
});
