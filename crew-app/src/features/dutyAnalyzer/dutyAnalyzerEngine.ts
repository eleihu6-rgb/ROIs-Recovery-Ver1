import {
  EASA_AUGMENTED_FDP_ROWS,
  OPERATOR_6007_ROWS,
  OPERATOR_6007_UNKNOWN_ROWS,
  OPERATOR_6008_BLOCK_EXTENSION_MINUTES,
  OPERATOR_6008_FDP_EXTENSION_MINUTES,
  appliedBasicFdpSelection,
} from './dutyAnalyzerRulePack';
import {
  DUTY_ANALYZER_RULE_PACK_VERSION,
  type AnalyzerMetric,
  type DutyAnalyzerInput,
  type DutyAnalyzerResult,
  type MetricStatus,
} from './dutyAnalyzerTypes';

const TIGHT_MARGIN_MINUTES = 30;

const parseClock = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const maximumStatus = (actual: number | null, limit: number | null): MetricStatus => {
  if (actual == null || limit == null) return 'not-evaluated';
  if (actual > limit) return 'exceeded';
  return limit - actual <= TIGHT_MARGIN_MINUTES ? 'tight' : 'within';
};

const minimumStatus = (actual: number | null, minimum: number | null): MetricStatus => {
  if (actual == null || minimum == null) return 'not-evaluated';
  if (actual < minimum) return 'exceeded';
  return actual - minimum <= TIGHT_MARGIN_MINUTES ? 'tight' : 'within';
};

const overallStatus = (metrics: AnalyzerMetric[]): MetricStatus => {
  const states = metrics.map(metric => metric.status);
  if (states.includes('needs-review')) return 'needs-review';
  if (states.includes('exceeded')) return 'exceeded';
  if (states.includes('tight')) return 'tight';
  if (states.every(state => state === 'not-evaluated')) return 'not-evaluated';
  return 'within';
};

const headlineFor = (status: MetricStatus): string => ({
  within: 'Within evaluated limits',
  tight: 'Within limit · tight',
  exceeded: 'Limit exceeded',
  'not-evaluated': 'Needs input',
  'needs-review': 'Needs review',
})[status];

const maximumDetail = (label: string, actual: number | null, limit: number | null): string => {
  if (actual == null) return `${label} is not available.`;
  if (limit == null) return `${label} has no evaluated limit in this rule pack.`;
  const margin = limit - actual;
  if (margin < 0) return `${label} exceeds the limit by ${Math.abs(margin)} minutes.`;
  return `${margin} minutes remain to the evaluated limit.`;
};

const minimumDetail = (label: string, actual: number | null, minimum: number | null): string => {
  if (actual == null) return `${label} is not available.`;
  if (minimum == null) return `${label} has no evaluated minimum in this rule pack.`;
  const margin = actual - minimum;
  if (margin < 0) return `${label} is ${Math.abs(margin)} minutes below the required minimum.`;
  return `${margin} minutes above the required minimum.`;
};

const maximumMetric = (
  key: AnalyzerMetric['key'],
  label: string,
  actualMinutes: number | null,
  limitMinutes: number | null,
  ruleId: string,
  detail?: string,
): AnalyzerMetric => ({
  key,
  label,
  actualMinutes,
  limitMinutes,
  marginMinutes: actualMinutes == null || limitMinutes == null ? null : limitMinutes - actualMinutes,
  status: maximumStatus(actualMinutes, limitMinutes),
  detail: detail ?? maximumDetail(label, actualMinutes, limitMinutes),
  ruleId,
});

const minimumMetric = (
  key: AnalyzerMetric['key'],
  label: string,
  actualMinutes: number | null,
  limitMinutes: number | null,
  ruleId: string,
  detail?: string,
): AnalyzerMetric => ({
  key,
  label,
  actualMinutes,
  limitMinutes,
  marginMinutes: actualMinutes == null || limitMinutes == null ? null : actualMinutes - limitMinutes,
  status: minimumStatus(actualMinutes, limitMinutes),
  detail: detail ?? minimumDetail(label, actualMinutes, limitMinutes),
  ruleId,
});

interface FdpEvaluation {
  fdpLimit: number | null;
  dpLimit: number | null;
  blockLimit: number | null;
  detail: string;
  review: string | null;
}

export interface NewDutyTiming {
  actualFdpMinutes: number | null;
  requiredRestMinutes: number | null;
  maximumFdpMinutes: number | null;
  latestChockOnMinuteOfDay: number | null;
  latestChockOnDayOffset: number;
}

const evaluateFdpLimits = (input: DutyAnalyzerInput): FdpEvaluation => {
  if (input.crewCategory !== 'flight-deck') {
    return {
      fdpLimit: null,
      dpLimit: null,
      blockLimit: null,
      detail: '',
      review: 'Cabin-crew limits require an approved cabin rule pack.',
    };
  }

  if (input.composition === '3P' || input.composition === '4P') {
    if (input.acclimatisation === 'unknown') {
      return {
        fdpLimit: null,
        dpLimit: null,
        blockLimit: null,
        detail: '',
        review: 'Augmented-crew limits with unknown acclimatisation need airline review.',
      };
    }
    const row = EASA_AUGMENTED_FDP_ROWS.find(candidate =>
      candidate.composition === input.composition && candidate.restFacility === input.restFacility,
    );
    if (!row) {
      return {
        fdpLimit: null,
        dpLimit: null,
        blockLimit: null,
        detail: '',
        review: 'Select the augmented crew rest-facility class.',
      };
    }
    const sectorIndex = input.sectors >= 1 && input.sectors <= 2 ? input.sectors - 1 : null;
    return sectorIndex == null
      ? {
        fdpLimit: null,
        dpLimit: null,
        blockLimit: null,
        detail: '',
        review: 'The bundled augmented rows support one or two sectors.',
      }
      : {
        fdpLimit: row.limits[sectorIndex],
        dpLimit: null,
        blockLimit: null,
        detail: `${input.composition} augmented crew · Class ${input.restFacility} facility · ${input.sectors} sector${input.sectors === 1 ? '' : 's'}.`,
        review: null,
      };
  }

  if (input.acclimatisation === 'unknown') {
    if (input.restBeforeMinutes == null) {
      return {
        fdpLimit: null,
        dpLimit: null,
        blockLimit: null,
        detail: '',
        review: 'Prior off-duty period is required when acclimatisation is unknown.',
      };
    }
    const row = OPERATOR_6007_UNKNOWN_ROWS.find(candidate =>
      input.restBeforeMinutes != null
        && input.restBeforeMinutes >= candidate.minOdpMinutes
        && input.restBeforeMinutes < candidate.maxOdpMinutes
        && input.sectors >= candidate.minLandings
        && input.sectors <= candidate.maxLandings,
    );
    return row
      ? {
        fdpLimit: row.maxFdpMinutes,
        dpLimit: row.maxDpMinutes,
        blockLimit: row.maxBlockMinutes,
        detail: `Unknown acclimatisation · prior off-duty period below 30 hours · ${input.sectors} landing${input.sectors === 1 ? '' : 's'}.`,
        review: null,
      }
      : {
        fdpLimit: null,
        dpLimit: null,
        blockLimit: null,
        detail: '',
        review: 'No approved limit row matches this prior off-duty period and landing count.',
      };
  }

  const selection = appliedBasicFdpSelection(input.reportMinuteOfDay, input.sectors);
  const row = selection
    ? OPERATOR_6007_ROWS.find(candidate =>
      candidate.startMinute === parseClock(selection.start)
        && candidate.endMinute === parseClock(selection.end)
        && input.sectors >= candidate.minLandings
        && input.sectors <= candidate.maxLandings,
    )
    : null;
  return row && selection
    ? {
      fdpLimit: selection.maxFdpMinutes,
      dpLimit: row.maxDpMinutes,
      blockLimit: row.maxBlockMinutes,
      detail: `Report ${selection.start}–${selection.end} · ${input.sectors} landing${input.sectors === 1 ? '' : 's'}.`,
      review: null,
    }
    : {
      fdpLimit: null,
      dpLimit: null,
      blockLimit: null,
      detail: '',
      review: 'No approved limit row matches this report time and landing count.',
    };
};

export const newDutyTiming = (input: DutyAnalyzerInput): NewDutyTiming => {
  const limits = evaluateFdpLimits(input);
  const splitExtension = Math.max(0, Math.floor(input.splitBreakMinutes / 2));
  const maximumFdpMinutes = limits.fdpLimit == null ? null : limits.fdpLimit + splitExtension;
  const chockOn = input.latestChockOnMinuteOfDay;
  const actualFdpMinutes = chockOn == null
    ? null
    : (chockOn - input.reportMinuteOfDay + 24 * 60) % (24 * 60);
  const requiredRestMinutes = actualFdpMinutes == null
    ? null
    : Math.max(actualFdpMinutes, input.atHomeBase ? 720 : input.timezoneDifferenceHours < 4 ? 600 : 840);
  return {
    actualFdpMinutes,
    requiredRestMinutes,
    maximumFdpMinutes,
    latestChockOnMinuteOfDay: maximumFdpMinutes == null
      ? null
      : (input.reportMinuteOfDay + maximumFdpMinutes) % (24 * 60),
    latestChockOnDayOffset: maximumFdpMinutes == null
      ? 0
      : Math.floor((input.reportMinuteOfDay + maximumFdpMinutes) / (24 * 60)),
  };
};

const evaluateRestLimit = (input: DutyAnalyzerInput): { limit: number | null; detail: string } => {
  if (input.dpMinutes == null) return { limit: null, detail: 'DP is needed to calculate minimum rest.' };
  if (input.atHomeBase) {
    const limit = Math.max(input.dpMinutes, 720);
    return { limit, detail: `Home-base rest is the greater of DP and 12 hours (${formatDuration(limit)}).` };
  }
  const floor = input.timezoneDifferenceHours < 4 ? 600 : 840;
  const limit = Math.max(input.dpMinutes, floor);
  return {
    limit,
    detail: `Away-base rest is the greater of DP and ${floor / 60} hours (${formatDuration(limit)}).`,
  };
};

export const evaluateDuty = (input: DutyAnalyzerInput): DutyAnalyzerResult => {
  const limits = evaluateFdpLimits(input);
  const splitExtension = Math.max(0, Math.floor(input.splitBreakMinutes / 2));
  const normalFdpLimit = limits.fdpLimit == null ? null : limits.fdpLimit + splitExtension;
  const discretionAllowed = input.composition === 'basic' || input.composition === '2P';
  const discretionReview = input.useDiscretion && !discretionAllowed
    ? 'Commander discretion for this crew composition needs airline review.'
    : null;
  const fdpLimit = input.useDiscretion && discretionAllowed && normalFdpLimit != null
    ? normalFdpLimit + OPERATOR_6008_FDP_EXTENSION_MINUTES
    : normalFdpLimit;
  const blockLimit = input.useDiscretion && discretionAllowed && limits.blockLimit != null
    ? limits.blockLimit + OPERATOR_6008_BLOCK_EXTENSION_MINUTES
    : limits.blockLimit;
  const rest = evaluateRestLimit(input);
  const review = limits.review ?? discretionReview;

  const metrics: AnalyzerMetric[] = [
    {
      ...maximumMetric('fdp', 'FDP', input.fdpMinutes, fdpLimit, '6007/6008'),
      extendedLimitMinutes: normalFdpLimit == null ? null : normalFdpLimit + OPERATOR_6008_FDP_EXTENSION_MINUTES,
      status: review ? 'needs-review' : maximumStatus(input.fdpMinutes, fdpLimit),
      detail: review ?? maximumDetail('FDP', input.fdpMinutes, fdpLimit),
    },
    {
      ...maximumMetric('dp', 'DP', input.dpMinutes, limits.dpLimit, '6007'),
      status: limits.review ? 'needs-review' : maximumStatus(input.dpMinutes, limits.dpLimit),
      detail: limits.review ?? maximumDetail('DP', input.dpMinutes, limits.dpLimit),
    },
    {
      ...maximumMetric('block', 'Block', input.blockMinutes, blockLimit, '6007/6008'),
      extendedLimitMinutes: limits.blockLimit == null ? null : limits.blockLimit + OPERATOR_6008_BLOCK_EXTENSION_MINUTES,
      status: limits.review ? 'needs-review' : maximumStatus(input.blockMinutes, blockLimit),
      detail: limits.review ?? maximumDetail('Block', input.blockMinutes, blockLimit),
    },
    minimumMetric(
      'rest',
      'Rest',
      input.restAfterMinutes,
      rest.limit,
      '7026',
      input.restAfterMinutes == null
        ? 'Next report or rest duration is needed.'
        : `${rest.detail} ${minimumDetail('Rest', input.restAfterMinutes, rest.limit)}`,
    ),
  ];
  const status = overallStatus(metrics);
  return {
    status,
    headline: headlineFor(status),
    metrics,
    explanation: [
      input.locallyCalculatedMetrics?.length
        ? `${input.locallyCalculatedMetrics.map(key => key.toUpperCase()).join(' and ')} calculated locally from duty report to release because the portal did not publish ${input.locallyCalculatedMetrics.length === 1 ? 'it' : 'them'}.`
        : '',
      review ?? limits.detail,
      splitExtension > 0 ? `Split-duty extension: +${splitExtension} minutes.` : 'No split-duty extension applied.',
      input.useDiscretion
        ? 'Commander discretion applied: FDP +2 hours and block +30 minutes.'
        : 'Commander discretion is not included in the normal limit.',
      rest.detail,
    ].filter(Boolean),
    source: 'EASA duty limits',
    rulePackVersion: DUTY_ANALYZER_RULE_PACK_VERSION,
  };
};

export const formatDuration = (minutes: number | null): string => {
  if (minutes == null || !Number.isFinite(minutes)) return 'Not published';
  const sign = minutes < 0 ? '−' : '';
  const value = Math.abs(Math.round(minutes));
  return `${sign}${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
