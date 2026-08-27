// NPBS-Legend predicate -> portal bid property mapping.
//
// Single source of truth for converting one NPBS preference line (a "predicate")
// into a portal bid descriptor the Playwright page-object can place. Predicates
// that have no faithful portal equivalent are returned as { skipped, reason } and
// recorded by the caller -- we never invent portal inputs to force a fit (rule #7).
//
// Portal property codes (authority): packages/contracts/pbs-{pairing,days-off,line,reserve}-bids.js
// Current-bid replay only targets conditions visible in the merged /bid UI. Old
// catalog entries are returned as skipped instead of being forced into hidden UI.

const MONTH_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/;

// Split a comma-separated NPBS list, keeping "Mon D, YYYY" dates intact (the
// year fragment after the comma is re-joined to its date).
const splitCsv = (s) => {
  const parts = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (/^\d{4}$/.test(part) && out.length && MONTH_RE.test(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]}, ${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
};

// Strip trailing NPBS group-flow suffixes that are not part of the predicate value.
const stripFlowSuffix = (s) =>
  s
    .replace(/\s+Else Start Next Bid Group$/i, '')
    .replace(/\s+All or Nothing$/i, '')
    .trim();

const mapPairingCheckTime = (match, timeType) => ({
  propertyCode: 103,
  name: 'Pairing Check-In / Check-Out Time',
  bid: match[2]
    ? {
        type: 'pairing-check-time',
        timeType,
        operator: 'Between',
        from: match[2],
        to: match[3],
        dateScope: null,
      }
    : {
        type: 'pairing-check-time',
        timeType,
        operator: match[4],
        value: match[5],
        dateScope: null,
      },
});

const skipped = (reason) => ({ skipped: true, reason });
const hiddenCurrentCatalog = (name) => skipped(`hidden-current-catalog: ${name}`);
const needsValue = (name, detail) => skipped(`needs-value: ${name}${detail ? ` (${detail})` : ''}`);
const unsupportedCurrentEditor = (name, detail) => skipped(`unsupported-current-editor: ${name}${detail ? ` (${detail})` : ''}`);

const parsePairingNumbers = (text) => text
  .replace(/\s+Check-In Date [A-Z][a-z]{2} \d{1,2}, \d{4}/gi, '')
  .split(',')
  .map((part) => part.trim())
  .map((part) => part.replace(/\s+Limit\s+\d+$/i, '').trim())
  .filter(Boolean);

const strictLengthRange = (operator, value) => {
  const n = Number(value);
  if (operator === '>') return { minDays: n + 1, maxDays: null };
  if (operator === '<') return { minDays: null, maxDays: Math.max(1, n - 1) };
  return { minDays: n, maxDays: n };
};

// Lines that are bid-group structure / flow, never a placeable preference.
export const isNoiseLine = (line) => {
  const t = line.trim();
  return (
    /Bid Group$/i.test(t) ||
    /^Award Pairings$/i.test(t) ||
    /^Avoid Pairings$/i.test(t) ||
    /^Clear Schedule and Start Next Bid Group$/i.test(t) ||
    t === ''
  );
};

// Pairing predicate matchers. Each takes the post-"If" condition (primary clause
// only) and returns a portal descriptor, or null if it does not match.
const pairingMatchers = [
  {
    re: /^Any Landing In (?:\(Counting Deadhead Legs\) )?(.+)$/i,
    map: (m) => {
      const locations = splitCsv(m[1]);
      return {
        propertyCode: 168,
        name: 'Airport Preference',
        bid: { type: 'airport-preference', event: 'landing', locations, values: locations, dateScope: null, minimumLayoverDuration: null },
      };
    },
  },
  {
    // Pairing Number TB5355  |  T4506, T4545  |  T4506 Check-In Date Jun 2, 2026, ...
    re: /^Pairing Number (.+)$/i,
    map: (m) => ({
      propertyCode: 102,
      name: 'Pairing Preference',
      bid: {
        type: 'pairing-preference',
        values: parsePairingNumbers(m[1]),
        dateScope: null,
      },
    }),
  },
  {
    re: /^Pairing Check-In Time (Between (\d{2}:\d{2}) And (\d{2}:\d{2})|(>|<) (\d{2}:\d{2}))$/i,
    map: (m) => mapPairingCheckTime(m, 'check_in'),
  },
  {
    re: /^Any Layover In (.+)$/i,
    map: (m) => {
      const locations = splitCsv(m[1]);
      return {
        propertyCode: 168,
        name: 'Airport Preference',
        bid: { type: 'airport-preference', event: 'layover', locations, values: locations, dateScope: null, minimumLayoverDuration: null },
      };
    },
  },
  {
    re: /^Pairing Total Credit (>|<) (\d+:\d{2})$/i,
    map: () => hiddenCurrentCatalog('Pairing Total Credit'),
  },
  {
    re: /^Departing On (.+)$/i,
    map: () => hiddenCurrentCatalog('Departing On'),
  },
  {
    re: /^(?:Any|Every|Total) Duty Legs (>|<|=) (\d+) legs?$/i,
    map: (m) => ({ propertyCode: 107, name: 'Flight Legs per Duty', bid: { type: 'flight-legs-per-duty', operator: m[1], value: Number(m[2]), dateScope: null } }),
  },
  {
    re: /^Total Legs In Pairing (>|<|=) (\d+) legs?$/i,
    map: () => hiddenCurrentCatalog('Total Legs In Pairing'),
  },
  {
    re: /^Average Daily Credit (>|<) (\d+:\d{2})$/i,
    map: () => hiddenCurrentCatalog('Average Daily Credit'),
  },
  {
    re: /^Any Duty On (.+)$/i,
    map: () => unsupportedCurrentEditor('Work Day Preference', 'legacy predicate has date/day but no required check-in windows'),
  },
  {
    re: /^Pairing Check-Out Time (Between (\d{2}:\d{2}) And (\d{2}:\d{2})|(>|<) (\d{2}:\d{2}))$/i,
    map: (m) => mapPairingCheckTime(m, 'check_out'),
  },
  {
    re: /^Pairing Length (>|<|=) (\d+) days?$/i,
    map: (m) => ({
      propertyCode: 112,
      name: 'Pairing Length',
      bid: { type: 'pairing-length-preference', ...strictLengthRange(m[1], m[2]), dateScope: null },
    }),
  },
  {
    re: /^TAFB (>|<) (\d+:\d{2})$/i,
    map: () => hiddenCurrentCatalog('TAFB'),
  },
  {
    re: /^(Any|Every) Enroute Check-In Time (>|<|=) (\d{2}:\d{2})$/i,
    map: () => hiddenCurrentCatalog('Any/Every Enroute Check-In Time'),
  },
  {
    re: /^Any Leg With Employee Number (.+)$/i,
    map: () => hiddenCurrentCatalog('Any/Every Leg With Employee Number'),
  },
  {
    re: /^Any Flight Number (.+)$/i,
    map: (m) => ({ propertyCode: 116, name: 'Flight Number Preference', bid: { type: 'flight-number-preference', values: splitCsv(m[1]), dateScope: null } }),
  },
  {
    re: /^Any Leg Is Redeye$/i,
    map: () => ({ propertyCode: 117, name: 'Redeye Preference', bid: { type: 'redeye-preference', dateScope: null } }),
  },
  {
    re: /^Average Daily Block Time (>|<) (\d+:\d{2})$/i,
    map: () => hiddenCurrentCatalog('Average Daily Block Time'),
  },
];

const mapPairing = (action, condition) => {
  // A predicate may chain multiple "If" clauses; map the primary clause only and
  // report the dropped secondary clauses to the caller.
  const clauses = condition.split(/\s+If\s+/i);
  const primary = clauses[0].trim();
  if (/^(?:Most Flying(?: Hours)? In (?:The )?Least(?: Amount Of)? (?:(?:Flying|Working) )?Days?|Efficient Flying(?: First)?)$/i.test(primary)) {
    if (action !== 'award') {
      return skipped('efficient_flying_mode_ambiguous: Avoid Efficient Flying First');
    }

    return {
      page: 'pairing',
      action: 'award',
      propertyCode: 428,
      name: 'Efficient Flying First',
      bid: { type: 'efficient-flying-preference', mode: 'efficient' },
      droppedClauses: clauses.slice(1).map((clause) => clause.trim()),
    };
  }
  if (/^Inefficient Flying$/i.test(primary)) {
    return {
      page: 'pairing',
      action: 'award',
      propertyCode: 428,
      name: 'Efficient Flying First',
      bid: { type: 'efficient-flying-preference', mode: 'inefficient' },
      droppedClauses: clauses.slice(1).map((clause) => clause.trim()),
    };
  }
  for (const matcher of pairingMatchers) {
    const m = primary.match(matcher.re);
    if (m) {
      const desc = matcher.map(m);
      if (desc.skipped) return desc;
      return {
        page: 'pairing',
        action,
        ...desc,
        droppedClauses: clauses.slice(1).map((c) => c.trim()),
      };
    }
  }
  return null;
};

const DATE_RE = '[A-Z][a-z]{2} \\d{1,2}, \\d{4}';

const mapPreferOff = (rest) => {
  const cleaned = stripFlowSuffix(rest);
  const offDescriptor = (bid) => ({ page: 'days-off', action: 'award', propertyCode: 201, name: 'Prefer Off', bid, droppedClauses: [] });

  // Pull off an optional time window: "... Between HH:MM And HH:MM"
  let body = cleaned;
  let window;
  const win = body.match(/\s+Between (\d{2}:\d{2}) And (\d{2}:\d{2})$/);
  if (win) {
    window = { from: win[1], to: win[2] };
    body = body.slice(0, win.index).trim();
  }

  // Date range: "Jun 18, 2026 - Jun 15, 2026"
  const range = body.match(new RegExp(`^(${DATE_RE}) - (${DATE_RE})$`));
  if (range) return offDescriptor({ type: 'prefer-off', mode: 'date_range', from: range[1], to: range[2], values: [range[1], range[2]], window, raw: cleaned });

  let mode = 'dates';
  if (/^Weekends/i.test(body)) mode = 'weekends';
  else if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(body)) mode = 'days_of_week';

  return offDescriptor({ type: 'prefer-off', mode, values: splitCsv(body), window, raw: cleaned });
};

const mapSetCondition = (rest) => {
  const r = stripFlowSuffix(rest);
  let m;
  if ((m = r.match(/^Maximum Days On In A Row (\d+)/i)))
    return hiddenCurrentCatalog('Max Consecutive Days On');
  if ((m = r.match(new RegExp(`^(?:Minimum Days Off In A Row|(\\d+) Consecutive Days Off In A Row)\\s*(\\d+)?\\s+Between\\s+(${DATE_RE})\\s+And\\s+(${DATE_RE})$`, 'i')))) {
    return wrap('days-off', 204, 'Long Stretch Off / Compressed Flying', {
      type: 'stepper-date-range',
      value: Number(m[1] ?? m[2]),
      from: m[3],
      to: m[4],
    });
  }
  if ((m = r.match(/^(\d+) Consecutive Days Off In A Row/i)))
    return needsValue('Long Stretch Off / Compressed Flying', 'date range is required by the current editor');
  if ((m = r.match(/^Minimum Days Off In A Row (\d+)/i)))
    return needsValue('Long Stretch Off / Compressed Flying', 'date range is required by the current editor');
  if ((m = r.match(/^Pattern Between (\d+) and (\d+) Days On, with (\d+) Days Off/i)))
    return wrap('line', 408, 'Commuter Pattern', { type: 'days-off-on-pattern', daysOnMin: Number(m[1]), daysOnMax: Number(m[2]), daysOff: Number(m[3]) });
  if (/^Maximum Credit Window$/i.test(r)) return wrap('line', 429, 'Credit Window Preference', { type: 'credit-window-preference', direction: 'more' });
  if (/^Minimum Credit Window$/i.test(r)) return wrap('line', 429, 'Credit Window Preference', { type: 'credit-window-preference', direction: 'less' });
  if ((m = r.match(/^Minimum Base Layover\s+(\d{1,3}:\d{2})$/i)))
    return wrap('line', 407, 'Minimum Base Layover', { type: 'minimum-base-layover', minimumDuration: m[1] });
  if (/^No Same Day Pairings/i.test(r)) return hiddenCurrentCatalog('No Same Day Pairings');
  if (/^Most Flying(?: Hours)? In (?:The )?Least(?: Amount Of)? (?:(?:Flying|Working) )?Days?/i.test(r))
    return wrap('pairing', 428, 'Efficient Flying First', { type: 'efficient-flying-preference', mode: 'efficient' });
  if ((m = r.match(/^Short Call Type (\w+)/i)))
    return wrap('reserve', 301, 'Reserve Preference', { type: 'reserve-call-type-date-scope', callType: m[1].toUpperCase(), dateScope: { mode: 'whole_month' } });
  if (/^Award Reserve$/i.test(r))
    return wrap('line', 427, 'Reserve', { type: 'flag' }, 'award');
  if (/^Avoid Reserve$/i.test(r))
    return wrap('line', 427, 'Reserve', { type: 'flag' }, 'avoid');
  if (/^Reserve Avoidance If Possible$/i.test(r))
    return skipped('reserve_avoidance_if_possible_unsupported');
  if (/^Reserve Avoidance No Matter What$/i.test(r))
    return wrap('line', 427, 'Reserve', { type: 'flag' }, 'avoid');
  return null;
};

const wrap = (page, propertyCode, name, bid, action = 'award') => ({ page, action, propertyCode, name, bid, droppedClauses: [] });

// Map a single predicate line to a portal descriptor or { skipped, reason }.
export const mapPredicate = (predicate) => {
  const line = predicate.trim();

  let m;
  if ((m = line.match(/^(Award|Avoid) Pairings If (.+)$/i))) {
    const action = m[1].toLowerCase() === 'award' ? 'award' : 'avoid';
    const mapped = mapPairing(action, m[2]);
    if (mapped) return mapped;
    return { skipped: true, reason: `unmapped-pairing-condition: ${m[2]}` };
  }
  if (/^Prefer Off /i.test(line)) return mapPreferOff(line.replace(/^Prefer Off /i, ''));
  if (/^Set Condition /i.test(line)) {
    const mapped = mapSetCondition(line.replace(/^Set Condition /i, ''));
    if (mapped) return mapped;
    return { skipped: true, reason: `unmapped-set-condition: ${line}` };
  }
  if (/^Waive No Same Day Duty Starts/i.test(line)) return hiddenCurrentCatalog('Waive No Same Day Duty Starts');
  if (/^Reserve Day On/i.test(line)) return hiddenCurrentCatalog('Reserve Day On');

  return { skipped: true, reason: `unmapped-predicate: ${line}` };
};
