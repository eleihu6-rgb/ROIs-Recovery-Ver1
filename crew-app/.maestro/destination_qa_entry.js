// Bundle entry for the September TG destination fixture on a later calendar date.
// This file is used only by the simulator visual test, never by the shipped app.
const RealDate = Date;
const fixedNow = new RealDate('2026-09-12T09:00:00Z').getTime();
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [fixedNow]));
  }
  static now() { return fixedNow; }
};
require('../index');
