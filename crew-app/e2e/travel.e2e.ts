import { device, element, by, expect as detoxExpect, waitFor } from 'detox';

describe('Travel booking flow', () => {
  beforeAll(async () => {
    // Launch with mock auth so we skip login
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxMockAuth: 'true' },
    });
  });

  it('shows the home screen with bottom navigation', async () => {
    await detoxExpect(element(by.id('home-screen'))).toBeVisible();
    await detoxExpect(element(by.id('tab-home'))).toBeVisible();
    await detoxExpect(element(by.id('tab-roster'))).toBeVisible();
    await detoxExpect(element(by.id('tab-travel'))).toBeVisible();
    await detoxExpect(element(by.id('tab-layover'))).toBeVisible();
    await detoxExpect(element(by.id('tab-profile'))).toBeVisible();
  });

  it('navigates to travel search screen', async () => {
    await element(by.id('tab-travel')).tap();
    await detoxExpect(element(by.id('travel-screen'))).toBeVisible();
  });

  it('can enter origin and destination', async () => {
    await element(by.id('tab-travel')).tap();
    await element(by.id('origin-input')).tap();
    await element(by.id('origin-input')).typeText('BKK');
    await element(by.id('destination-input')).tap();
    await element(by.id('destination-input')).typeText('NRT');
    await detoxExpect(element(by.id('origin-input'))).toHaveText('BKK');
    await detoxExpect(element(by.id('destination-input'))).toHaveText('NRT');
  });

  it('can trigger a flight search', async () => {
    await element(by.id('tab-travel')).tap();
    await element(by.id('origin-input')).typeText('BKK');
    await element(by.id('destination-input')).typeText('NRT');
    await element(by.id('search-flights-btn')).tap();
    await waitFor(element(by.id('flight-results-list')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
