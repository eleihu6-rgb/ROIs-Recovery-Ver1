/**
 * Launch screen regression cover.
 *
 * Bug: every cold start showed the stock React Native template launch screen —
 * a big "RoyceTravelTemplate" heading and "Powered by React Native" footer —
 * before the app's own UI appeared.
 *
 * Fix: LaunchScreen.storyboard is now blank white. These tests pin that the
 * template branding stays gone and the background stays an explicit white that
 * matches the RootNavigator hydration splash (colors.white), so the handoff is
 * seamless in dark mode too.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { colors } from '../../src/theme';

const RAW = readFileSync(
  join(__dirname, '..', '..', 'ios', 'RoyceTravelTemplate', 'LaunchScreen.storyboard'),
  'utf8',
);

// Assert against markup only — the file's own comments mention the removed
// labels and colours by name, and would otherwise trip every check below.
const STORYBOARD = RAW.replace(/<!--[\s\S]*?-->/g, '');

describe('LaunchScreen.storyboard', () => {
  it('shows no template branding', () => {
    expect(STORYBOARD).not.toContain('Powered by React Native');
    expect(STORYBOARD).not.toContain('text="RoyceTravelTemplate"');
  });

  it('renders no labels at all', () => {
    expect(STORYBOARD).not.toMatch(/<label\b/);
    expect(STORYBOARD).not.toMatch(/\btext="/);
  });

  it('is still a launch storyboard with an initial view controller', () => {
    // Dropping either makes iOS letterbox the app at a legacy screen size.
    expect(STORYBOARD).toContain('launchScreen="YES"');
    expect(STORYBOARD).toContain('initialViewController="01J-lp-oVM"');
    expect(STORYBOARD).toMatch(/<viewController id="01J-lp-oVM"/);
  });

  it('pins an explicit white background, not a dynamic system colour', () => {
    // systemBackgroundColor resolves to black in dark mode, which would flash
    // black before the white splash.
    expect(STORYBOARD).toContain(
      '<color key="backgroundColor" red="1" green="1" blue="1" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>',
    );
    expect(STORYBOARD).not.toContain('systemBackgroundColor');
  });

  it('matches the splash background the app itself renders', () => {
    // RootNavigator's pre-hydration splash uses colors.white; if that token ever
    // changes, the storyboard has to change with it or the handoff will flash.
    expect(colors.white.toLowerCase()).toBe('#ffffff');
  });

  it('leaves no constraints pointing at the removed labels', () => {
    // Stale constraint references to deleted views crash storyboard inflation.
    for (const deletedViewId of ['GJd-Yh-RWb', 'MN2-I3-ftu']) {
      expect(STORYBOARD).not.toContain(deletedViewId);
    }
  });
});
