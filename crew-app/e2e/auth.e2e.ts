import { device, element, by, expect as detoxExpect } from 'detox';

describe('Authentication flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('shows the onboarding screen on first launch', async () => {
    await detoxExpect(element(by.id('onboarding-screen'))).toBeVisible();
  });

  it('navigates to login after onboarding is complete', async () => {
    await element(by.id('onboarding-get-started-btn')).tap();
    await detoxExpect(element(by.id('login-screen'))).toBeVisible();
  });

  it('shows Google Sign-In button on login screen', async () => {
    await element(by.id('onboarding-get-started-btn')).tap();
    await detoxExpect(element(by.id('google-signin-btn'))).toBeVisible();
  });
});
