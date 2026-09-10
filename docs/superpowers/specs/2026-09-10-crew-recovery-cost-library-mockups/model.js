/* Shared demonstration data. Prices are not operational airline tariffs. */
(() => {
  const templates = { quantity: 'Quantity x unit price', fixed: 'Fixed per event', minimum: 'Minimum billable quantity', guarantee: 'Pay-period difference', standby: 'Standby time credit + pairing', bands: 'Marginal rate bands', booking: 'Booking replacement' };
  const row = (id, name, category, unit, rate, template, source, extra = {}) => ({ id, name, category, unit, rate, template, source, enabled: true, scope: 'All bases', threshold: 120, upperRate: 25, minimum: 4, ...extra });
  const defaults = () => ({ version: 2, currency: 'USD', rates: [
    row('P02', 'Pay above guaranteed hours', 'Crew pay', 'credit hour', 100, 'guarantee', 'User-defined demo policy', { guarantee: 85, tiers: [{ upTo: 90, multiplier: 1.2 }, { upTo: null, multiplier: 1.5 }], scope: 'Flight crew / demo contract' }),
    row('P03', 'Airport standby credit', 'Crew pay', 'credit hour', null, 'standby', 'User-defined standby-who-flies rule', { factor: 0.5, cutoffHours: 1 }),
    row('P04', 'Home standby activation', 'Crew pay', 'callout', 200, 'fixed', 'R2 / section 1.4'),
    row('P07', 'Day-off recall', 'Crew pay', 'callout', 600, 'fixed', 'R2 / cabin example'),
    row('P09', 'Short-notice roster change', 'Crew pay', 'change', 150, 'fixed', 'R2 / section 1.4'),
    row('P12', 'Lead cabin position premium', 'Crew pay', 'credit hour', null, 'quantity', 'R1 / section 4.3.1'),
    row('P13', 'Language allowance', 'Crew pay', 'sector', null, 'quantity', 'R1 / section 6.7.1'),
    row('P14', 'Third-pilot augmentation', 'Crew pay', 'sector', 1200, 'fixed', 'R2 / section 1.4'),
    row('L01', 'Hotel accommodation', 'Accommodation', 'room-night', 140, 'quantity', 'R2 / section 1.4', { scope: 'ADD / demo hotel tariff' }),
    row('L02', 'Day-use room', 'Accommodation', 'room-block', 90, 'quantity', 'R2 / section 1.4'),
    row('L03', 'Per diem', 'Accommodation', 'person-day', 60, 'quantity', 'R2 / section 1.4'),
    row('L04', 'Own-airline deadhead', 'Positioning', 'seat-sector', 120, 'quantity', 'R2 / section 1.4'),
    row('L05', 'Other-airline deadhead', 'Positioning', 'seat-sector', 600, 'quantity', 'R2 / section 1.4'),
    row('L06', 'Ground transfer', 'Positioning', 'vehicle-trip', 80, 'quantity', 'Synthetic tariff'),
    row('L08', 'Hotel booking replacement', 'Accommodation', 'booking', 160, 'booking', 'Synthetic tariff', { original: 140, refund: 140, fee: 0 }),
    row('X01', 'Incremental flight delay', 'Other operating cash', 'minute', 60, 'bands', 'R2 / illustrative curve'),
    row('X05', 'Aircraft ferry sector', 'Other operating cash', 'sector', 9000, 'quantity', 'R2 / section 1.4')
  ], fixture: { beforeA: 84, beforeB: 70, added: 5.75, removed: 0, baselineStandby: 0, report: '2026-09-10T07:00', departure: '2026-09-10T10:00', quantity: 12, delayBefore: 120, delayAfter: 140 }, policy: { objective: 'crew', maxCost: 5000 } });
  const allowed = r => r.id === 'P02' ? ['guarantee'] : r.id === 'P03' ? ['standby'] : r.id === 'X01' ? ['bands', 'quantity'] : r.id === 'L08' ? ['booking'] : ['quantity', 'fixed', 'minimum'];
  const nonnegative = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;
  const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ? Date.parse(`${value}:00Z`) : NaN;
  const hours = value => {
    if (value === null) return 'Unavailable';
    const minutes = Math.round(value * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  };
  const validate = s => {
    if (!s || s.version !== 2 || s.currency !== 'USD' || !Array.isArray(s.rates) || s.rates.length < 17 || s.rates.length > 100) throw Error('Expected a version 2 USD cost library. Version 1 uses obsolete standby fees.');
    const ids = new Set();
    for (const r of s.rates) {
      if (!r || typeof r.id !== 'string' || ids.has(r.id)) throw Error('Cost IDs must be unique.');
      ids.add(r.id);
      for (const k of ['name', 'category', 'unit', 'source', 'scope']) if (typeof r[k] !== 'string' || r[k].length > 160) throw Error('Invalid cost labels.');
      if (typeof r.enabled !== 'boolean' || !allowed(r).includes(r.template) || (r.rate !== null && !nonnegative(r.rate))) throw Error('Invalid rate or calculation template.');
      for (const k of ['threshold', 'upperRate', 'minimum']) if (!nonnegative(r[k])) throw Error('Thresholds and quantities must be nonnegative.');
      if (r.template === 'guarantee') {
        if (!nonnegative(r.guarantee) || !Array.isArray(r.tiers) || !r.tiers.length || r.tiers.length > 20) throw Error('Set GH and between 1 and 20 overage tiers.');
        let from = r.guarantee;
        for (const [index, tier] of r.tiers.entries()) {
          if (!tier || !nonnegative(tier.multiplier)) throw Error('Tier multipliers must be nonnegative.');
          if (index === r.tiers.length - 1) { if (tier.upTo !== null) throw Error('The final tier must cover all remaining hours.'); }
          else { if (!nonnegative(tier.upTo) || tier.upTo <= from) throw Error('Tier boundaries must increase above GH without gaps.'); from = tier.upTo; }
        }
      }
      if (r.template === 'standby' && (!nonnegative(r.factor) || !nonnegative(r.cutoffHours) || r.rate !== null)) throw Error('Standby requires X and Y parameters, not a cash unit price.');
      if (r.template === 'booking' && (![r.original, r.refund, r.fee].every(nonnegative) || r.refund > r.original)) throw Error('Refund cannot exceed the original booking.');
    }
    for (const r of defaults().rates) {
      const imported = s.rates.find(v => v.id === r.id);
      if (!imported || imported.unit !== r.unit || imported.category !== r.category) throw Error('Required costs and billing units must be preserved.');
    }
    if (!s.fixture || !Object.keys(defaults().fixture).filter(k => !['report','departure'].includes(k)).every(k => nonnegative(s.fixture[k]))) throw Error('Invalid test quantities.');
    if (!Number.isFinite(instant(s.fixture.report)) || !Number.isFinite(instant(s.fixture.departure)) || instant(s.fixture.departure) < instant(s.fixture.report)) throw Error('Departure must be on or after standby report. Dates and times are UTC.');
    if (s.fixture.removed + s.fixture.baselineStandby > Math.min(s.fixture.beforeA, s.fixture.beforeB)) throw Error('Removed and replaced standby credit cannot exceed baseline credit.');
    if (!s.policy || !['crew', 'total'].includes(s.policy.objective) || !nonnegative(s.policy.maxCost)) throw Error('Invalid selection policy.');
    return s;
  };
  const pay = (credit, r) => {
    let amount = r.guarantee * r.rate, from = r.guarantee;
    for (const tier of r.tiers) {
      const end = tier.upTo ?? Infinity;
      amount += Math.max(0, Math.min(credit, end) - from) * r.rate * tier.multiplier;
      from = end;
    }
    return amount;
  };
  const cost = (r, q = 1, before = 0, after = q) => {
    if (!r || !r.enabled || r.rate === null || r.template === 'standby') return null;
    if (r.template === 'guarantee') return pay(after, r) - pay(before, r);
    if (r.template === 'fixed') return q > 0 ? r.rate : 0;
    if (r.template === 'minimum') return q > 0 ? Math.max(q, r.minimum) * r.rate : 0;
    if (r.template === 'booking') return r.rate + r.fee - r.refund;
    if (r.template === 'bands') {
      const cumulative = t => Math.min(t, r.threshold) * r.rate + Math.max(0, t - r.threshold) * r.upperRate;
      return cumulative(after) - cumulative(before);
    }
    return q * r.rate;
  };
  const rate = (s, id) => s.rates.find(r => r.id === id);
  const standby = s => {
    const rule = rate(s, 'P03');
    if (!rule.enabled) return null;
    const elapsed = Math.max(0, (instant(s.fixture.departure) - instant(s.fixture.report)) / 3600000 - rule.cutoffHours);
    return { elapsed, credit: elapsed * rule.factor, assignment: elapsed * rule.factor + s.fixture.added };
  };
  const crew = (s, who) => {
    const credited = standby(s), before = s.fixture[`before${who}`];
    const after = credited ? before - s.fixture.baselineStandby - s.fixture.removed + credited.assignment : before;
    const delta = credited ? cost(rate(s, 'P02'), 1, before, after) : null;
    return { who, before, after, delta, standby: credited?.credit ?? null, assignment: credited?.assignment ?? null, total: delta };
  };
  const formula = r => {
    if (r.template === 'guarantee') return `P(after) - P(before); GH ${r.guarantee} h at base rate; ` + r.tiers.map((tier,index) => `>${index ? r.tiers[index-1].upTo : r.guarantee}${tier.upTo === null ? ' h' : ` through ${tier.upTo} h`} at ${tier.multiplier}x`).join('; ');
    if (r.template === 'standby') return `max(0, departure - ${r.cutoffHours} h - report) x ${r.factor} + pairing credit`;
    if (r.template === 'bands') return `D(after) - D(before); first ${r.threshold} min x ${r.rate}, remainder x ${r.upperRate}`;
    if (r.template === 'minimum') return `max(quantity, ${r.minimum}) x ${r.rate}, when quantity > 0`;
    if (r.template === 'booking') return `${r.rate} new + ${r.fee} fee - ${r.refund} refund`;
    if (r.template === 'fixed') return `One ${r.rate} payment per qualifying event`;
    return `Billable ${r.unit}s x ${r.rate === null ? 'unpriced' : r.rate}`;
  };
  window.CostModel = { defaults, templates, allowed, validate, pay, cost, rate, crew, standby, hours, formula };
})();
