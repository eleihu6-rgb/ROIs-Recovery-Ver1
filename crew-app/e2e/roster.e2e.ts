import { device, element, by, expect as detoxExpect } from 'detox';

describe('Roster screen', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxMockAuth: 'true' },
    });
  });

  it('navigates to roster tab', async () => {
    await element(by.id('tab-roster')).tap();
    await detoxExpect(element(by.id('roster-screen'))).toBeVisible();
  });

  it('shows a calendar view', async () => {
    await element(by.id('tab-roster')).tap();
    await detoxExpect(element(by.id('roster-calendar'))).toBeVisible();
  });

  it('tapping a day shows that day\'s flights', async () => {
    await element(by.id('tab-roster')).tap();
    // Tap the first day cell visible
    await element(by.id('roster-day-1')).tap();
    await detoxExpect(element(by.id('day-detail-panel'))).toBeVisible();
  });
});
