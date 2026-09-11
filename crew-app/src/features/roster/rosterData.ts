// Parsed from: data/Crew Roster Sample.csv
// In production this will be fetched from Firebase / email capture pipeline.

export interface RosterEntry {
  crewId: string;
  checkInDateUTC: string;
  fltNumber: string;
  flightDateUTC: string;
  depArp: string;
  arvDateUTC: string;
  arvArp: string;
  fleet: string;
  hotel: string;
}

export interface RosterSection {
  title: string; // check-in datetime (duty group header)
  data: RosterEntry[];
}

// Raw CSV rows parsed into typed objects
export const rosterData: RosterEntry[] = [
  {
    crewId: '891939',
    checkInDateUTC: '01 Jun 2026 0100',
    fltNumber: 'FA105',
    flightDateUTC: '20 May 2026 0300',
    depArp: 'TPE',
    arvDateUTC: '20 May 2026 0600',
    arvArp: 'BKK',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '',
    fltNumber: 'FA106',
    flightDateUTC: '20 May 2026 0700',
    depArp: 'BKK',
    arvDateUTC: '20 May 2026 1000',
    arvArp: 'TPE',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '',
    fltNumber: 'FA107',
    flightDateUTC: '20 May 2026 1100',
    depArp: 'TPE',
    arvDateUTC: '20 May 2026 1300',
    arvArp: 'NRT',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '',
    fltNumber: 'FA108',
    flightDateUTC: '20 May 2026 1400',
    depArp: 'NRT',
    arvDateUTC: '20 May 2026 1700',
    arvArp: 'TPE',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '01 Jun 2026 0100',
    fltNumber: 'FA100',
    flightDateUTC: '01 Jun 2026 0300',
    depArp: 'TPE',
    arvDateUTC: '01 Jun 2026 0400',
    arvArp: 'HKG',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '',
    fltNumber: 'FA101',
    flightDateUTC: '01 Jun 2026 0500',
    depArp: 'HKG',
    arvDateUTC: '01 Jun 2026 0600',
    arvArp: 'TPE',
    fleet: '350',
    hotel: '',
  },
  {
    crewId: '891939',
    checkInDateUTC: '03 Jun 2026 0100',
    fltNumber: 'FA200',
    flightDateUTC: '03 Jun 2026 0300',
    depArp: 'TPE',
    arvDateUTC: '03 Jun 2026 1100',
    arvArp: 'YVR',
    fleet: '350',
    hotel: 'Hyatt Regency',
  },
  {
    crewId: '891939',
    checkInDateUTC: '',
    fltNumber: 'FA201',
    flightDateUTC: '05 Jun 2026 1300',
    depArp: 'YVR',
    arvDateUTC: '06 Jun 2026 0200',
    arvArp: 'TPE',
    fleet: '350',
    hotel: '',
  },
];

/**
 * Groups roster entries into duty periods.
 * A new duty period starts whenever checkInDateUTC is non-empty.
 * Entries with empty checkInDateUTC belong to the preceding duty period.
 */
export function groupByCheckIn(entries: RosterEntry[]): RosterSection[] {
  const sections: RosterSection[] = [];
  let current: RosterSection | null = null;

  for (const entry of entries) {
    if (entry.checkInDateUTC.trim() !== '') {
      current = { title: entry.checkInDateUTC, data: [entry] };
      sections.push(current);
    } else if (current) {
      current.data.push(entry);
    } else {
      // Edge case: first row has no check-in — create an ungrouped section
      current = { title: 'Ungrouped', data: [entry] };
      sections.push(current);
    }
  }

  return sections;
}
