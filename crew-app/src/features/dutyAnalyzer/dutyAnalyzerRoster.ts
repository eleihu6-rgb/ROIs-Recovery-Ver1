import type { Trip, TripLeg } from '../travel/tripCsv';
import { knownAirportZone } from '../settings/airportZones';
import { hhmmInZone, parseRosterUTC } from '../settings/timeFormat';
import { groupDuties } from '../v2/dutyGroups';
import type {
  AnalyzerDiversionEdit,
  AnalyzerDutyTimeline,
  AnalyzerPublishedDutyBaseline,
  AnalyzerRosterDuty,
  AnalyzerRosterPairing,
  AnalyzerRosterSegment,
  AnalyzerSegmentTimeEdit,
  DutyAnalyzerInput,
  TimelineShiftScope,
} from './dutyAnalyzerTypes';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const pairingDateLabel = (value: string): string => {
  const local = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (local) {
    const [, year, month, day] = local;
    const monthLabel = MONTHS[Number(month) - 1];
    return monthLabel ? `${day} ${monthLabel} ${year}` : value;
  }
  const roster = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!roster) return '';
  const [, day, month, year] = roster;
  return `${day.padStart(2, '0')} ${month} ${year}`;
};

const pairingRoute = (trip: Trip): string => {
  const flyingLegs = trip.legs.filter(leg => (leg.assignment ?? 'FLY').toUpperCase() === 'FLY');
  if (!flyingLegs.length) return 'No flight sectors';
  return flyingLegs
    .map((leg, index) => index === 0 ? `${leg.depArp}–${leg.arvArp}` : leg.arvArp)
    .join('–');
};

const isoOrNull = (value: string): string | null => {
  const date = parseRosterUTC(value);
  return date ? date.toISOString() : null;
};

export const addUtcMinutes = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const minutesBetween = (fromUtc: string, toUtc: string): number =>
  Math.round((new Date(toUtc).getTime() - new Date(fromUtc).getTime()) / 60_000);

const segmentId = (tripId: string, dutyIndex: number, legIndex: number): string =>
  `${tripId}:duty-${dutyIndex}:segment-${legIndex}`;

const rosterSegment = (
  tripId: string,
  dutyIndex: number,
  legIndex: number,
  leg: TripLeg,
): AnalyzerRosterSegment => {
  const id = segmentId(tripId, dutyIndex, legIndex);
  const departureUtc = isoOrNull(leg.flightDateUTC) ?? '';
  const arrivalUtc = isoOrNull(leg.arvDateUTC) ?? '';
  return {
    id,
    sourceSegmentId: id,
    kind: 'roster',
    flightNumber: leg.fltNumber,
    fleet: leg.fleet,
    from: leg.depArp,
    to: leg.arvArp,
    plannedTo: leg.arvArp,
    departureUtc,
    arrivalUtc,
    publishedDepartureUtc: departureUtc,
    publishedArrivalUtc: arrivalUtc,
    recoveryForSegmentId: null,
  };
};

const cloneSegment = (segment: AnalyzerRosterSegment): AnalyzerRosterSegment => ({ ...segment });
const cloneBaseline = (baseline: AnalyzerPublishedDutyBaseline): AnalyzerPublishedDutyBaseline => ({ ...baseline });

export const timelineRoute = (segments: AnalyzerRosterSegment[]): string => {
  if (!segments.length) return 'No flight sectors';
  return segments
    .map((segment, index) => index === 0 ? `${segment.from}–${segment.to}` : segment.to)
    .join('–');
};

const defaultContext = (context?: DutyAnalyzerInput): Omit<
  DutyAnalyzerInput,
  'reportMinuteOfDay' | 'sectors' | 'fdpMinutes' | 'dpMinutes' | 'blockMinutes'
  | 'restBeforeMinutes' | 'restAfterMinutes' | 'locallyCalculatedMetrics'
> => ({
  crewCategory: context?.crewCategory ?? 'flight-deck',
  acclimatisation: context?.acclimatisation ?? 'acclimatised',
  composition: context?.composition ?? 'basic',
  restFacility: context?.restFacility ?? null,
  atHomeBase: context?.atHomeBase ?? true,
  timezoneDifferenceHours: context?.timezoneDifferenceHours ?? 0,
  splitBreakMinutes: context?.splitBreakMinutes ?? 0,
  useDiscretion: context?.useDiscretion ?? false,
});

export const rosterDuties = (trips: Trip[], crewId: string | null): AnalyzerRosterDuty[] => {
  const duties = trips
    .filter(trip => !crewId || trip.crewId === crewId)
    .flatMap(trip => groupDuties(trip).map(group => {
      const reportUtc = isoOrNull(group.reportUTC) ?? '';
      const lastLeg = group.legs[group.legs.length - 1];
      const lastArrival = isoOrNull(lastLeg.arvDateUTC);
      const releaseUtc = reportUtc && group.dpMinutes != null
        ? addUtcMinutes(reportUtc, group.dpMinutes)
        : lastArrival;
      const segments = group.legs.map((leg, index) =>
        rosterSegment(trip.id, group.index, group.firstLegIndex + index, leg));
      const publishedBaseline: AnalyzerPublishedDutyBaseline = {
        source: 'portal',
        reportUtc,
        releaseUtc,
        nextReportUtc: null,
        finalArrivalUtc: lastArrival,
        sectors: group.legs.length,
        fdpMinutes: group.fdpMinutes,
        dpMinutes: group.dpMinutes,
        blockMinutes: group.blockMinutes,
        restMinutes: group.restHours == null ? null : Math.round(group.restHours * 60),
      };
      return {
        id: `${trip.id}:${group.key}`,
        tripId: trip.id,
        dutyIndex: group.index,
        route: timelineRoute(segments),
        reportAirport: segments[0]?.from ?? '',
        reportUtc,
        releaseUtc,
        nextReportUtc: null,
        sectors: group.legs.length,
        fdpMinutes: group.fdpMinutes,
        dpMinutes: group.dpMinutes,
        blockMinutes: group.blockMinutes,
        restMinutes: publishedBaseline.restMinutes,
        lastFlight: lastLeg.fltNumber,
        segments,
        publishedBaseline,
      } satisfies AnalyzerRosterDuty;
    }))
    .sort((a, b) => a.reportUtc.localeCompare(b.reportUtc));

  return duties.map((duty, index) => {
    const nextReportUtc = duties[index + 1]?.reportUtc || null;
    return {
      ...duty,
      nextReportUtc,
      publishedBaseline: { ...duty.publishedBaseline, nextReportUtc },
    };
  });
};

export const rosterPairings = (trips: Trip[], crewId: string | null): AnalyzerRosterPairing[] => {
  const filteredTrips = trips.filter(trip => !crewId || trip.crewId === crewId);
  const duties = rosterDuties(filteredTrips, crewId);
  const dutiesByTrip = new Map<string, AnalyzerRosterDuty[]>();
  duties.forEach(duty => {
    const grouped = dutiesByTrip.get(duty.tripId) ?? [];
    grouped.push(duty);
    dutiesByTrip.set(duty.tripId, grouped);
  });
  return filteredTrips
    .map(trip => ({
      id: trip.id,
      route: pairingRoute(trip),
      dateLabel: pairingDateLabel(trip.checkInDateUTC),
      duties: dutiesByTrip.get(trip.id) ?? [],
    }))
    .filter(pairing => pairing.duties.length > 0)
    .sort((a, b) => (a.duties[0]?.reportUtc ?? '').localeCompare(b.duties[0]?.reportUtc ?? ''));
};

export const cloneDutyTimeline = (duty: AnalyzerRosterDuty): AnalyzerDutyTimeline => ({
  dutyId: duty.id,
  reportAirport: duty.reportAirport,
  reportUtc: duty.reportUtc,
  reportFrozen: true,
  nextReportUtc: duty.nextReportUtc,
  segments: duty.segments.map(cloneSegment),
  publishedBaseline: cloneBaseline(duty.publishedBaseline),
});

export const editSegmentTimes = (
  timeline: AnalyzerDutyTimeline,
  selectedSegmentId: string,
  edit: AnalyzerSegmentTimeEdit,
): AnalyzerDutyTimeline => ({
  ...timeline,
  segments: timeline.segments.map(segment => segment.id === selectedSegmentId
    ? { ...segment, ...edit }
    : cloneSegment(segment)),
  publishedBaseline: cloneBaseline(timeline.publishedBaseline),
});

export const shiftReportTime = (timeline: AnalyzerDutyTimeline, minutes: number): AnalyzerDutyTimeline => ({
  ...timeline,
  reportUtc: addUtcMinutes(timeline.reportUtc, minutes),
  segments: timeline.segments.map(cloneSegment),
  publishedBaseline: cloneBaseline(timeline.publishedBaseline),
});

export const shiftLinkedTimes = (
  timeline: AnalyzerDutyTimeline,
  selectedSegmentId: string,
  minutes: number,
  scope: TimelineShiftScope,
): AnalyzerDutyTimeline => {
  const selectedIndex = timeline.segments.findIndex(segment => segment.id === selectedSegmentId);
  if (selectedIndex < 0) return { ...timeline, segments: timeline.segments.map(cloneSegment) };
  return {
    ...timeline,
    segments: timeline.segments.map((segment, index) => {
      const shouldShift = scope === 'duty'
        || (scope === 'following' ? index >= selectedIndex : index === selectedIndex);
      return shouldShift
        ? {
          ...segment,
          departureUtc: addUtcMinutes(segment.departureUtc, minutes),
          arrivalUtc: addUtcMinutes(segment.arrivalUtc, minutes),
        }
        : cloneSegment(segment);
    }),
    publishedBaseline: cloneBaseline(timeline.publishedBaseline),
  };
};

export const divertAndAddRecovery = (
  timeline: AnalyzerDutyTimeline,
  selectedSegmentId: string,
  edit: AnalyzerDiversionEdit,
): AnalyzerDutyTimeline => {
  const selectedIndex = timeline.segments.findIndex(segment => segment.id === selectedSegmentId);
  if (selectedIndex < 0) return { ...timeline, segments: timeline.segments.map(cloneSegment) };
  const selected = timeline.segments[selectedIndex];
  const recovery: AnalyzerRosterSegment = {
    id: `${selected.id}:recovery`,
    sourceSegmentId: null,
    kind: 'recovery',
    flightNumber: edit.recoveryFlightNumber ?? `${selected.flightNumber}R`,
    fleet: edit.recoveryFleet ?? selected.fleet,
    from: edit.destination,
    to: selected.plannedTo,
    plannedTo: selected.plannedTo,
    departureUtc: edit.recoveryDepartureUtc,
    arrivalUtc: edit.recoveryArrivalUtc,
    publishedDepartureUtc: null,
    publishedArrivalUtc: null,
    recoveryForSegmentId: selected.id,
  };
  const segments = timeline.segments
    .filter(segment => segment.recoveryForSegmentId !== selected.id)
    .map(cloneSegment);
  const divertedIndex = segments.findIndex(segment => segment.id === selected.id);
  segments[divertedIndex] = {
    ...segments[divertedIndex],
    to: edit.destination,
    arrivalUtc: edit.divertArrivalUtc,
  };
  segments.splice(divertedIndex + 1, 0, recovery);
  return { ...timeline, segments, publishedBaseline: cloneBaseline(timeline.publishedBaseline) };
};

const timelineBlockMinutes = (timeline: AnalyzerDutyTimeline): number | null => {
  const baseline = timeline.publishedBaseline.blockMinutes;
  if (baseline == null) {
    return timeline.segments.every(segment => segment.departureUtc && segment.arrivalUtc)
      ? timeline.segments.reduce((total, segment) => total + minutesBetween(segment.departureUtc, segment.arrivalUtc), 0)
      : null;
  }
  return timeline.segments.reduce((total, segment) => {
    const current = minutesBetween(segment.departureUtc, segment.arrivalUtc);
    if (segment.kind === 'recovery' || !segment.publishedDepartureUtc || !segment.publishedArrivalUtc) {
      return total + current;
    }
    const published = minutesBetween(segment.publishedDepartureUtc, segment.publishedArrivalUtc);
    return total + current - published;
  }, baseline);
};

export const timelineInput = (
  timeline: AnalyzerDutyTimeline,
  context?: DutyAnalyzerInput,
): DutyAnalyzerInput => {
  const baseline = timeline.publishedBaseline;
  const finalArrivalUtc = timeline.segments[timeline.segments.length - 1]?.arrivalUtc ?? null;
  const finalArrivalDelta = finalArrivalUtc && baseline.finalArrivalUtc
    ? minutesBetween(baseline.finalArrivalUtc, finalArrivalUtc)
    : 0;
  const reportDelta = baseline.reportUtc && timeline.reportUtc
    ? minutesBetween(baseline.reportUtc, timeline.reportUtc)
    : 0;
  const elapsedToArrival = finalArrivalUtc && timeline.reportUtc
    ? minutesBetween(timeline.reportUtc, finalArrivalUtc)
    : null;
  const fdpMinutes = baseline.fdpMinutes == null
    ? elapsedToArrival
    : baseline.fdpMinutes + finalArrivalDelta - reportDelta;
  const dpMinutes = baseline.dpMinutes == null
    ? elapsedToArrival
    : baseline.dpMinutes + finalArrivalDelta - reportDelta;
  const simulatedReleaseUtc = baseline.releaseUtc
    ? addUtcMinutes(baseline.releaseUtc, finalArrivalDelta - reportDelta)
    : finalArrivalUtc;
  const restAfterMinutes = timeline.nextReportUtc && simulatedReleaseUtc
    ? minutesBetween(simulatedReleaseUtc, timeline.nextReportUtc)
    : null;
  const report = new Date(timeline.reportUtc);
  const reportZone = knownAirportZone(timeline.reportAirport);
  const reportClock = reportZone ? hhmmInZone(report, reportZone) : null;
  const reportMinuteOfDay = reportClock
    ? Number(reportClock.slice(0, 2)) * 60 + Number(reportClock.slice(3, 5))
    : report.getUTCHours() * 60 + report.getUTCMinutes();
  return {
    ...defaultContext(context),
    reportMinuteOfDay,
    sectors: timeline.segments.length,
    fdpMinutes,
    dpMinutes,
    blockMinutes: timelineBlockMinutes(timeline),
    restBeforeMinutes: baseline.restMinutes,
    restAfterMinutes,
    locallyCalculatedMetrics: [
      ...(baseline.fdpMinutes == null && fdpMinutes != null ? ['fdp' as const] : []),
      ...(baseline.dpMinutes == null && dpMinutes != null ? ['dp' as const] : []),
    ],
  };
};

export const rosterInput = (
  duty: AnalyzerRosterDuty,
  delayMinutes = 0,
  context?: DutyAnalyzerInput,
): DutyAnalyzerInput => {
  const timeline = cloneDutyTimeline(duty);
  const lastSegment = timeline.segments[timeline.segments.length - 1];
  if (!lastSegment) return timelineInput(timeline, context);
  const shifted = shiftLinkedTimes(timeline, lastSegment.id, delayMinutes, 'segment');
  return { ...timelineInput(shifted, context), blockMinutes: duty.blockMinutes };
};
