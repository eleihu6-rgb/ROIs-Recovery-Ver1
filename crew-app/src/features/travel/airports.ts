// Curated IATA airport reference — THAI's network plus the major hubs crews
// connect through. Used to (1) validate that a captured/enriched roster leg has a
// REAL airport (not a blank placeholder or a stray 3-letter token) and (2) show a
// city label where we have one. Not exhaustive; extend as routes are added.

export interface AirportRef {
  /** IATA 3-letter code. */
  code: string;
  /** City / airport name for display. */
  city: string;
}

export const AIRPORTS: ReadonlyArray<AirportRef> = [
  // Thailand
  { code: 'BKK', city: 'Bangkok (Suvarnabhumi)' },
  { code: 'DMK', city: 'Bangkok (Don Mueang)' },
  { code: 'HKT', city: 'Phuket' },
  { code: 'CNX', city: 'Chiang Mai' },
  { code: 'CEI', city: 'Chiang Rai' },
  { code: 'USM', city: 'Koh Samui' },
  { code: 'KBV', city: 'Krabi' },
  { code: 'HDY', city: 'Hat Yai' },
  { code: 'UTH', city: 'Udon Thani' },
  { code: 'KKC', city: 'Khon Kaen' },
  { code: 'UBP', city: 'Ubon Ratchathani' },
  // East Asia
  { code: 'HKG', city: 'Hong Kong' },
  { code: 'NRT', city: 'Tokyo (Narita)' },
  { code: 'HND', city: 'Tokyo (Haneda)' },
  { code: 'KIX', city: 'Osaka (Kansai)' },
  { code: 'NGO', city: 'Nagoya' },
  { code: 'CTS', city: 'Sapporo' },
  { code: 'FUK', city: 'Fukuoka' },
  { code: 'ICN', city: 'Seoul (Incheon)' },
  { code: 'TPE', city: 'Taipei' },
  { code: 'PEK', city: 'Beijing (Capital)' },
  { code: 'PVG', city: 'Shanghai (Pudong)' },
  { code: 'CAN', city: 'Guangzhou' },
  { code: 'CTU', city: 'Chengdu' },
  { code: 'KMG', city: 'Kunming' },
  { code: 'XMN', city: 'Xiamen' },
  // South-East Asia
  { code: 'SIN', city: 'Singapore' },
  { code: 'KUL', city: 'Kuala Lumpur' },
  { code: 'PEN', city: 'Penang' },
  { code: 'CGK', city: 'Jakarta' },
  { code: 'DPS', city: 'Bali (Denpasar)' },
  { code: 'MNL', city: 'Manila' },
  { code: 'SGN', city: 'Ho Chi Minh City' },
  { code: 'HAN', city: 'Hanoi' },
  { code: 'RGN', city: 'Yangon' },
  { code: 'PNH', city: 'Phnom Penh' },
  { code: 'REP', city: 'Siem Reap' },
  { code: 'VTE', city: 'Vientiane' },
  // South Asia / Middle East
  { code: 'DEL', city: 'Delhi' },
  { code: 'BOM', city: 'Mumbai' },
  { code: 'BLR', city: 'Bengaluru' },
  { code: 'MAA', city: 'Chennai' },
  { code: 'CCU', city: 'Kolkata' },
  { code: 'HYD', city: 'Hyderabad' },
  { code: 'CMB', city: 'Colombo' },
  { code: 'DAC', city: 'Dhaka' },
  { code: 'KTM', city: 'Kathmandu' },
  { code: 'MLE', city: 'Malé' },
  { code: 'DXB', city: 'Dubai' },
  { code: 'DOH', city: 'Doha' },
  { code: 'AUH', city: 'Abu Dhabi' },
  { code: 'MCT', city: 'Muscat' },
  { code: 'KWI', city: 'Kuwait' },
  { code: 'JED', city: 'Jeddah' },
  { code: 'IST', city: 'Istanbul' },
  { code: 'AMD', city: 'Ahmedabad' },
  { code: 'KHI', city: 'Karachi' },
  { code: 'ISB', city: 'Islamabad' },
  { code: 'LHE', city: 'Lahore' },
  // Europe
  { code: 'LHR', city: 'London (Heathrow)' },
  { code: 'CDG', city: 'Paris (CDG)' },
  { code: 'FRA', city: 'Frankfurt' },
  { code: 'MUC', city: 'Munich' },
  { code: 'ZRH', city: 'Zurich' },
  { code: 'CPH', city: 'Copenhagen' },
  { code: 'BRU', city: 'Brussels' },
  { code: 'FCO', city: 'Rome (Fiumicino)' },
  { code: 'MXP', city: 'Milan (Malpensa)' },
  { code: 'VIE', city: 'Vienna' },
  { code: 'OSL', city: 'Oslo' },
  { code: 'ARN', city: 'Stockholm' },
  { code: 'MAD', city: 'Madrid' },
  // Oceania / Americas
  { code: 'SYD', city: 'Sydney' },
  { code: 'MEL', city: 'Melbourne' },
  { code: 'BNE', city: 'Brisbane' },
  { code: 'PER', city: 'Perth' },
  { code: 'AKL', city: 'Auckland' },
  { code: 'LAX', city: 'Los Angeles' },
  { code: 'SFO', city: 'San Francisco' },
  { code: 'JFK', city: 'New York (JFK)' },
];

const BY_CODE: Record<string, AirportRef> = {};
for (const a of AIRPORTS) {
  BY_CODE[a.code] = a;
}

/** True when `code` is a real, known IATA airport (case-insensitive). */
export function isRealAirport(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(BY_CODE, code.trim().toUpperCase());
}

/** City label for a code, or the code itself when unknown. */
export function airportCity(code: string | null | undefined): string {
  if (!code) {
    return '';
  }
  const c = code.trim().toUpperCase();
  return BY_CODE[c]?.city ?? c;
}
