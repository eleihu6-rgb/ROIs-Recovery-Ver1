/**
 * Best-Fit Crew for an Open Pairing — mockup model.
 *
 * Synthetic fixtures only. No Rust service, no cost library, no roster write.
 * Loadable in a browser (`window.bestFitMockup`) and in node (`module.exports`)
 * so `verify.cjs` can assert the pipeline without a browser.
 *
 * Design: docs/superpowers/specs/2026-09-11-best-fit-crew-open-pairing-design.md
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.bestFitMockup = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  // ── formatting ─────────────────────────────────────────────────────────────

  const pad = (n) => String(n).padStart(2, '0')

  /** Minutes → "HH:MM" (hours may exceed 24). */
  const formatMinutes = (min) => {
    const value = Math.max(0, Math.round(min || 0))
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`
  }

  const formatMoney = (amount, currency) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency || 'CNY', maximumFractionDigits: 0,
  }).format(amount)

  /** "2026-09-14 06:25" → { ymd, hm, weekday, date } (treated as base-local wall time). */
  const parseLocal = (value) => {
    const [ymd, hm] = String(value).split(' ')
    const [y, m, d] = ymd.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return {
      ymd, hm,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()],
      short: `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`,
    }
  }

  const AS_OF = '2026-09-11'
  const daysUntil = (value) => {
    const a = Date.parse(`${AS_OF}T00:00:00Z`)
    const b = Date.parse(`${parseLocal(value).ymd}T00:00:00Z`)
    return Math.round((b - a) / 86_400_000)
  }

  // ── the open pairing under inspection (Entry 1 deep target) ────────────────

  const pairing = {
    id: 41287,
    label: 'PA-41287',
    base: 'DXB',
    fleet: 'B777',
    division: 'P',
    divisionLabel: 'Pilot',
    assignmentGroup: 'FLY',
    assignment: 'OPEN',
    depLocal: '2026-09-14 06:25',
    arrLocal: '2026-09-16 21:05',
    durationDays: 3,
    tafbMin: 62 * 60 + 40,
    blockMin: 18 * 60 + 25,
    dutyCount: 4,
    segCount: 9,
    composition: [
      { rank: 'CA', plan: 1, fill: 0 },
      { rank: 'FO', plan: 1, fill: 0 },
    ],
    coverage: 'open',
  }

  // ── the worklist (Entry 2) ─────────────────────────────────────────────────

  const openPairings = [
    { id: 41020, label: 'PA-41020', base: 'YEG', fleet: 'B737', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-12 14:05', arrLocal: '2026-09-13 18:35', durationDays: 2, blockMin: 12 * 60 + 30, tafbMin: 28 * 60 + 30, dutyCount: 3, segCount: 6, composition: [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 1, fill: 0 }], coverage: 'partial', uncoveredCreditMin: 12 * 60 + 30 },
    { id: 41102, label: 'PA-41102', base: 'DXB', fleet: 'B777', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-13 21:40', arrLocal: '2026-09-14 09:15', durationDays: 1, blockMin: 6 * 60 + 10, tafbMin: 11 * 60 + 35, dutyCount: 2, segCount: 3, composition: [{ rank: 'FO', plan: 1, fill: 0 }], coverage: 'partial', uncoveredCreditMin: 6 * 60 + 10 },
    { id: 41287, label: 'PA-41287', base: 'DXB', fleet: 'B777', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-14 06:25', arrLocal: '2026-09-16 21:05', durationDays: 3, blockMin: 18 * 60 + 25, tafbMin: 62 * 60 + 40, dutyCount: 4, segCount: 9, composition: [{ rank: 'CA', plan: 1, fill: 0 }, { rank: 'FO', plan: 1, fill: 0 }], coverage: 'open', uncoveredCreditMin: 18 * 60 + 25 },
    { id: 41166, label: 'PA-41166', base: 'ADD', fleet: 'B787', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-15 05:10', arrLocal: '2026-09-16 02:55', durationDays: 2, blockMin: 9 * 60 + 45, tafbMin: 21 * 60 + 45, dutyCount: 3, segCount: 5, composition: [{ rank: 'CA', plan: 1, fill: 0 }], coverage: 'open', uncoveredCreditMin: 9 * 60 + 45 },
    { id: 41233, label: 'PA-41233', base: 'DXB', fleet: 'A350', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-16 23:55', arrLocal: '2026-09-18 12:40', durationDays: 2, blockMin: 11 * 60 + 20, tafbMin: 36 * 60 + 45, dutyCount: 3, segCount: 7, composition: [{ rank: 'FO', plan: 2, fill: 0 }], coverage: 'open', uncoveredCreditMin: 11 * 60 + 20 },
    { id: 41355, label: 'PA-41355', base: 'ADD', fleet: 'B787', division: 'C', divisionLabel: 'Cabin', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-17 09:30', arrLocal: '2026-09-18 20:10', durationDays: 2, blockMin: 14 * 60 + 40, tafbMin: 34 * 60 + 40, dutyCount: 3, segCount: 6, composition: [{ rank: 'PU', plan: 1, fill: 0 }, { rank: 'FA', plan: 2, fill: 0 }], coverage: 'open', uncoveredCreditMin: 14 * 60 + 40 },
    { id: 40988, label: 'PA-40988', base: 'DXB', fleet: 'B777', division: 'P', divisionLabel: 'Pilot', assignmentGroup: 'FLY', assignment: 'OPEN', depLocal: '2026-09-18 07:15', arrLocal: '2026-09-19 15:20', durationDays: 2, blockMin: 8 * 60 + 5, tafbMin: 32 * 60 + 5, dutyCount: 2, segCount: 4, composition: [{ rank: 'CA', plan: 1, fill: 0 }], coverage: 'partial', uncoveredCreditMin: 8 * 60 + 5 },
  ]

  // ── the candidate crew universe ────────────────────────────────────────────
  // Flags are explicit so every funnel stage has a deterministic, non-zero count.
  //  basicExclusion: why Stage 1 removes the crew (null = survives)
  //  hardRules / softRules: rule codes the simulated assignment would (re)trigger

  const crews = [
    { crewId: '21034', name: 'Amara Haddad',    seniority: 1042.5, base: 'DXB', fleets: ['B777', 'A350'], rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 2430, mcredMin: 2580, mdo: 8, hardRules: [], softRules: [], cost: 3240, costStatus: 'priced' },
    { crewId: '21187', name: 'Daniel Okoro',    seniority: 3120.0, base: 'DXB', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1980, mcredMin: 2280, mdo: 9, hardRules: [], softRules: ['7501'], cost: 2980, costStatus: 'priced' },
    { crewId: '20765', name: 'Mei Lin Tan',     seniority: 512.25, base: 'DXB', fleets: ['B777', 'B787'], rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 3120, mcredMin: 3260, mdo: 10, hardRules: [], softRules: [], cost: 4680, costStatus: 'priced' },
    { crewId: '21402', name: 'Yusuf Rahman',    seniority: 2870.1, base: 'DXB', fleets: ['B777', 'A350'], rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1620, mcredMin: 1740, mdo: 11, hardRules: [], softRules: ['7501', '7305'], cost: null, costStatus: 'unpriced' },
    { crewId: '20988', name: 'Elena Petrova',   seniority: 661.4,  base: 'DXB', fleets: ['B777'],         rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 1155, mcredMin: 1310, mdo: 12, hardRules: ['7503'], softRules: [], cost: 2760, costStatus: 'priced' },
    { crewId: '21551', name: 'Kwame Mensah',    seniority: 3410.75,base: 'DXB', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 2250, mcredMin: 2400, mdo: 9, hardRules: [], softRules: [], cost: 2320, costStatus: 'priced' },
    { crewId: '20644', name: 'Sofia Marchetti', seniority: 880.0,  base: 'DXB', fleets: ['A350'],         rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 1770, mcredMin: 1900, mdo: 8, hardRules: [], softRules: [], cost: 3180, costStatus: 'priced', basicExclusion: 'fleet' },
    { crewId: '21320', name: 'Rafael Duarte',   seniority: 2760.4, base: 'YEG', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1470, mcredMin: 1600, mdo: 10, hardRules: [], softRules: [], cost: 4020, costStatus: 'priced', basicExclusion: 'base' },
    { crewId: '21990', name: 'Hannah Kim',      seniority: 3505.9, base: 'DXB', fleets: ['B777'],         rank: 'PU', division: 'P', status: 1, qualOk: true,  mbhMin: 1290, mcredMin: 1420, mdo: 9, hardRules: [], softRules: [], cost: 2640, costStatus: 'priced', basicExclusion: 'rank' },
    { crewId: '20877', name: 'Aisha Bello',     seniority: 402.1,  base: 'DXB', fleets: ['B777', 'B787'], rank: 'CA', division: 'P', status: 1, qualOk: false, mbhMin: 750,  mcredMin: 880,  mdo: 14, hardRules: [], softRules: [], cost: 3020, costStatus: 'priced', basicExclusion: 'qualification' },
    { crewId: '21733', name: 'Lucas Fernandes', seniority: 733.9,  base: 'DXB', fleets: ['B777'],         rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 1980, mcredMin: 2510, mdo: 8, hardRules: [], softRules: [], cost: 3120, costStatus: 'priced' },
    { crewId: '21109', name: 'Nadia Farouk',    seniority: 2990.3, base: 'DXB', fleets: ['B777', 'B787'], rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1350, mcredMin: 1520, mdo: 12, hardRules: [], softRules: ['8002'], cost: 2560, costStatus: 'priced' },
    { crewId: '21650', name: 'Ibrahim Sow',     seniority: 3605.2, base: 'DXB', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 2760, mcredMin: 2900, mdo: 7, hardRules: ['7503'], softRules: [], cost: 3340, costStatus: 'priced' },
    { crewId: '20498', name: 'Grace Nakamura',  seniority: 610.55, base: 'DXB', fleets: ['B777'],         rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 900,  mcredMin: 1040, mdo: 13, hardRules: [], softRules: [], cost: 3360, costStatus: 'priced' },
    { crewId: '21882', name: 'Tomás Rivas',     seniority: 3260.4, base: 'DXB', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1830, mcredMin: 1980, mdo: 10, hardRules: [], softRules: [], cost: null, costStatus: 'unpriced' },
    { crewId: '20577', name: 'Fatima Al-Sayed', seniority: 950.25, base: 'DXB', fleets: ['B777', 'A350'], rank: 'CA', division: 'P', status: 1, qualOk: true,  mbhMin: 2655, mcredMin: 2800, mdo: 8, hardRules: [], softRules: ['7507'], cost: 4150, costStatus: 'priced' },
    { crewId: '21264', name: 'Peter Novak',     seniority: 3180.0, base: 'ADD', fleets: ['B777'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 1560, mcredMin: 1690, mdo: 11, hardRules: [], softRules: [], cost: 4380, costStatus: 'priced', basicExclusion: 'base' },
    { crewId: '21947', name: 'Ravi Chandran',   seniority: 3460.8, base: 'DXB', fleets: ['B787'],         rank: 'FO', division: 'P', status: 1, qualOk: true,  mbhMin: 2190, mcredMin: 2340, mdo: 9, hardRules: [], softRules: [], cost: 2890, costStatus: 'priced', basicExclusion: 'fleet' },
    { crewId: '22010', name: 'Julia Weber',     seniority: 1110.0, base: 'DXB', fleets: ['B777'],         rank: 'CA', division: 'C', status: 1, qualOk: true,  mbhMin: 1440, mcredMin: 1560, mdo: 10, hardRules: [], softRules: [], cost: 3100, costStatus: 'priced', basicExclusion: 'division' },
    { crewId: '20815', name: 'Omar Haddad',     seniority: 1240.6, base: 'DXB', fleets: ['B777'],         rank: 'CA', division: 'P', status: 0, qualOk: true,  mbhMin: 1080, mcredMin: 1200, mdo: 12, hardRules: [], softRules: [], cost: 3210, costStatus: 'priced', basicExclusion: 'inactive' },
  ]

  const RULE_META = {
    '7501': { title: 'Post-duty rest', text: (p) => `Post-duty rest 10:30 is below the 12:00 minimum before the duty on ${p.arrLocal.slice(0, 10)}.` },
    '7503': { title: 'Max duty period', text: () => 'Duty period 13:45 exceeds the 13:00 maximum for a 4-sector duty.' },
    '7305': { title: 'Day off protection', text: () => 'The assignment would use the protected day off on 2026-09-15.' },
    '7507': { title: 'RP rest-day cover', text: () => 'Only 1 of the 2 required rest days remains free inside the roster period.' },
    '8002': { title: 'Manday credit', text: () => 'Monthly credit would reach 96:10, above the 95:00 soft ceiling.' },
    '7506': { title: 'Ground duty inclusion', text: () => 'Ground duty on the same day is not included in the duty period.' },
  }

  const COST_SET_LABEL = 'Daily Recovery · rev 3'
  const COST_FORMULA = 'marginal GH premium + layover + positioning'

  const costBreakdownOf = (crew) => {
    if (crew.costStatus !== 'priced' || crew.cost == null) return []
    const premium = Math.round(crew.cost * 0.46)
    const layover = Math.round(crew.cost * 0.34)
    return [
      { label: 'Marginal GH premium 85→90h', value: formatMoney(premium) },
      { label: 'Layover / hotel (2 nights)', value: formatMoney(layover) },
      { label: 'Positioning / DHD', value: formatMoney(crew.cost - premium - layover) },
    ]
  }

  // ── pipeline ───────────────────────────────────────────────────────────────

  const isActive = (crew) => crew.status === 1

  const canFill = (crew, slots) => {
    // CA may act down into an FO slot; FO may not act up into a CA slot.
    const allowed = crew.rank === 'CA' ? ['CA', 'FO'] : [crew.rank]
    return slots.some((slot) => allowed.includes(slot))
  }

  const openSlots = (p) => [...new Set((p.composition || []).filter((s) => (s.fill || 0) < (s.plan || 0)).map((s) => s.rank))]

  const basicRule = (crew, p) => {
    if (!isActive(crew)) return 'inactive'
    if (crew.division !== p.division) return 'division'
    if (crew.base !== p.base) return 'base'
    if (!(crew.fleets || []).includes(p.fleet)) return 'fleet'
    if (!crew.qualOk) return 'qualification'
    if (!canFill(crew, openSlots(p))) return 'rank'
    return null
  }

  const basicMatch = (p) => crews.filter((crew) => basicRule(crew, p || pairing) === null)

  const exclusionBreakdown = (p) => {
    const counts = {}
    for (const crew of crews) {
      const reason = basicRule(crew, p || pairing)
      if (reason) counts[reason] = (counts[reason] || 0) + 1
    }
    return counts
  }

  const legalityOf = (crewId) => {
    const crew = crews.find((c) => c.crewId === String(crewId))
    if (!crew) return { verdict: 'unknown', violations: [] }
    if (crew.hardRules.length > 0) {
      return {
        verdict: 'hard',
        violations: crew.hardRules.map((code) => ({
          ruleCode: code, ruleInstance: '001', severity: 3,
          title: RULE_META[code].title, message: RULE_META[code].text(pairing),
          windowStart: '2026-09-14 06:25', windowEnd: '2026-09-16 21:05',
        })),
      }
    }
    if (crew.softRules.length > 0) {
      return {
        verdict: 'soft',
        violations: crew.softRules.map((code, i) => ({
          ruleCode: code, ruleInstance: '001', severity: i === 0 ? 1 : 2,
          title: RULE_META[code].title, message: RULE_META[code].text(pairing),
          windowStart: '2026-09-14 06:25', windowEnd: '2026-09-16 21:05',
        })),
      }
    }
    return { verdict: 'pass', violations: [] }
  }

  const funnel = (p) => {
    const target = p || pairing
    const basic = basicMatch(target)
    let pass = 0, soft = 0, hard = 0
    for (const crew of basic) {
      const verdict = legalityOf(crew.crewId).verdict
      if (verdict === 'pass') pass += 1
      else if (verdict === 'soft') soft += 1
      else hard += 1
    }
    return {
      universe: crews.length,
      basic: basic.length,
      simulated: basic.length,
      pass, soft, hard,
      eligible: pass + soft,
      excluded: exclusionBreakdown(target),
    }
  }

  const rankCrews = (basis) => {
    const eligible = basicMatch(pairing).filter((crew) => legalityOf(crew.crewId).verdict !== 'hard')
    const rows = eligible.map((crew) => {
      const legality = legalityOf(crew.crewId)
      return {
        crew,
        legality,
        cost: {
          amount: crew.cost,
          currency: 'CNY',
          status: crew.costStatus,
          label: COST_SET_LABEL,
          formula: COST_FORMULA,
          breakdown: costBreakdownOf(crew),
        },
        mbh: formatMinutes(crew.mbhMin),
        mcred: formatMinutes(crew.mcredMin),
        blocked: false,
      }
    })
    const blockedRows = basicMatch(pairing)
      .filter((crew) => legalityOf(crew.crewId).verdict === 'hard')
      .map((crew) => ({
        crew,
        legality: legalityOf(crew.crewId),
        cost: { amount: crew.cost, currency: 'CNY', status: crew.costStatus, label: COST_SET_LABEL, formula: COST_FORMULA, breakdown: costBreakdownOf(crew) },
        mbh: formatMinutes(crew.mbhMin),
        mcred: formatMinutes(crew.mcredMin),
        blocked: true,
      }))

    const sorted = [...rows].sort((a, b) => {
      if (basis === 'cost') {
        const aUnpriced = a.cost.status === 'unpriced' ? 1 : 0
        const bUnpriced = b.cost.status === 'unpriced' ? 1 : 0
        if (aUnpriced !== bUnpriced) return aUnpriced - bUnpriced
        if (aUnpriced === 0 && a.cost.amount !== b.cost.amount) return a.cost.amount - b.cost.amount
        if (a.crew.mbhMin !== b.crew.mbhMin) return a.crew.mbhMin - b.crew.mbhMin
      } else {
        if (a.crew.mbhMin !== b.crew.mbhMin) return a.crew.mbhMin - b.crew.mbhMin
        if (a.crew.mcredMin !== b.crew.mcredMin) return a.crew.mcredMin - b.crew.mcredMin
        if (a.crew.seniority !== b.crew.seniority) return b.crew.seniority - a.crew.seniority
      }
      return a.crew.crewId.localeCompare(b.crew.crewId)
    })

    const blockedSorted = blockedRows.sort((a, b) => a.crew.mbhMin - b.crew.mbhMin || a.crew.crewId.localeCompare(b.crew.crewId))

    return sorted.concat(blockedSorted).map((row, index) => {
      const why = row.blocked
        ? `Hard violation ${row.legality.violations.map((v) => v.ruleCode).join(', ')} — not selectable`
        : basis === 'cost'
          ? (row.cost.status === 'priced'
            ? `lowest cost ${formatMoney(row.cost.amount)} · ${COST_SET_LABEL}`
            : `cost unpriced · ranked by fairness (MBH ${row.mbh})`)
          : `lowest MBH ${row.mbh}`
      return { ...row, rank: index + 1, why }
    })
  }

  const costTotal = (crewId) => {
    const crew = crews.find((c) => c.crewId === String(crewId))
    if (!crew) return null
    return { amount: crew.cost, currency: 'CNY', status: crew.costStatus, label: COST_SET_LABEL, formula: COST_FORMULA, breakdown: costBreakdownOf(crew) }
  }

  const queueRows = () => {
    const rows = openPairings.map((p) => {
      const f = funnel(p)
      return {
        ...p,
        openSlots: openSlots(p).map((rank) => {
          const slot = p.composition.find((s) => s.rank === rank)
          return { rank, count: (slot.plan || 0) - (slot.fill || 0) }
        }),
        daysUntil: daysUntil(p.depLocal),
        legalCount: f.eligible,
        hardCount: f.hard,
        baseCount: f.basic,
      }
    })
    rows.sort((a, b) => Date.parse(a.depLocal.replace(' ', 'T') + ':00Z') - Date.parse(b.depLocal.replace(' ', 'T') + ':00Z'))
    return rows
  }

  return {
    AS_OF, pairing, openPairings, crews,
    basicMatch, basicRule, legalityOf, funnel, rankCrews, costTotal, queueRows,
    openSlots, exclusionBreakdown,
    formatMinutes, formatMoney, parseLocal, daysUntil,
    COST_SET_LABEL, RULE_META,
  }
})
