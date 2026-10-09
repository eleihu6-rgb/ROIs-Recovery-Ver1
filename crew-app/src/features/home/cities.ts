// ─── City identity for trip postcards (Home tab) ─────────────────────────────
// Maps a destination airport to a human city name + a landmark photo so the Home
// postcard shows e.g. "Trip to SHANGHAI" over the Oriental Pearl Tower. Images
// are real, freely-licensed Wikimedia Commons LANDMARK photos, brand-graded for a
// consistent dusk look (backend/mine/fetchCity.py). A default image covers any
// destination we do not have a specific landmark for.
//
// Airport→city coverage is mined from real rosters (backend/mine/destinations.json,
// 9 crews × Apr–Jun 2026). To add/replace a city: drop a landmark JPG in
// cityImages/, add it to backend/mine/cityMap.json, run fetchCity.py, regenerate.

import type { ImageSourcePropType } from "react-native";
import type { Trip } from "../travel/tripCsv";

const IMAGES: Record<string, ImageSourcePropType> = {
  ahmedabad: require("./cityImages/ahmedabad.jpg"),
  auckland: require("./cityImages/auckland.jpg"),
  bali: require("./cityImages/bali.jpg"),
  bangkok: require("./cityImages/bangkok.jpg"),
  beijing: require("./cityImages/beijing.jpg"),
  bengaluru: require("./cityImages/bengaluru.jpg"),
  brisbane: require("./cityImages/brisbane.jpg"),
  cebu: require("./cityImages/cebu.jpg"),
  chennai: require("./cityImages/chennai.jpg"),
  chiangmai: require("./cityImages/chiangmai.jpg"),
  chiangrai: require("./cityImages/chiangrai.jpg"),
  colombo: require("./cityImages/colombo.jpg"),
  copenhagen: require("./cityImages/copenhagen.jpg"),
  davao: require("./cityImages/davao.jpg"),
  danang: require("./cityImages/danang.jpg"),
  doha: require("./cityImages/doha.jpg"),
  delhi: require("./cityImages/delhi.jpg"),
  dhaka: require("./cityImages/dhaka.jpg"),
  frankfurt: require("./cityImages/frankfurt.jpg"),
  fukuoka: require("./cityImages/fukuoka.jpg"),
  guam: require("./cityImages/guam.jpg"),
  guangzhou: require("./cityImages/guangzhou.jpg"),
  hanoi: require("./cityImages/hanoi.jpg"),
  hatyai: require("./cityImages/hatyai.jpg"),
  honolulu: require("./cityImages/honolulu.jpg"),
  hongkong: require("./cityImages/hongkong.jpg"),
  hyderabad: require("./cityImages/hyderabad.jpg"),
  islamabad: require("./cityImages/islamabad.jpg"),
  istanbul: require("./cityImages/istanbul.jpg"),
  jakarta: require("./cityImages/jakarta.jpg"),
  karachi: require("./cityImages/karachi.jpg"),
  kathmandu: require("./cityImages/kathmandu.jpg"),
  khonkaen: require("./cityImages/khonkaen.jpg"),
  kolkata: require("./cityImages/kolkata.jpg"),
  krabi: require("./cityImages/krabi.jpg"),
  kualalumpur: require("./cityImages/kualalumpur.jpg"),
  lahore: require("./cityImages/lahore.jpg"),
  london: require("./cityImages/london.jpg"),
  losangeles: require("./cityImages/losangeles.jpg"),
  manila: require("./cityImages/manila.jpg"),
  melbourne: require("./cityImages/melbourne.jpg"),
  milan: require("./cityImages/milan.jpg"),
  mumbai: require("./cityImages/mumbai.jpg"),
  munich: require("./cityImages/munich.jpg"),
  nagoya: require("./cityImages/nagoya.jpg"),
  newyork: require("./cityImages/newyork.jpg"),
  osaka: require("./cityImages/osaka.jpg"),
  oslo: require("./cityImages/oslo.jpg"),
  paris: require("./cityImages/paris.jpg"),
  penang: require("./cityImages/penang.jpg"),
  perth: require("./cityImages/perth.jpg"),
  phuket: require("./cityImages/phuket.jpg"),
  portmoresby: require("./cityImages/portmoresby.jpg"),
  saigon: require("./cityImages/saigon.jpg"),
  riyadh: require("./cityImages/riyadh.jpg"),
  seattle: require("./cityImages/seattle.jpg"),
  sanfrancisco: require("./cityImages/sanfrancisco.jpg"),
  seoul: require("./cityImages/seoul.jpg"),
  shanghai: require("./cityImages/shanghai.jpg"),
  singapore: require("./cityImages/singapore.jpg"),
  stockholm: require("./cityImages/stockholm.jpg"),
  sydney: require("./cityImages/sydney.jpg"),
  taipei: require("./cityImages/taipei.jpg"),
  tokyo: require("./cityImages/tokyo.jpg"),
  ubon: require("./cityImages/ubon.jpg"),
  udonthani: require("./cityImages/udonthani.jpg"),
  vancouver: require("./cityImages/vancouver.jpg"),
  vientiane: require("./cityImages/vientiane.jpg"),
  yangon: require("./cityImages/yangon.jpg"),
  zurich: require("./cityImages/zurich.jpg"),
  default: require("./cityImages/default.jpg"),
};

// Dark photo hues for the Duo destination information pane. Each hue comes from
// the corresponding landmark JPG's average RGB, with a fixed 19% lightness so
// white flight text remains readable. Keep this keyed with IMAGES when adding a
// city; the default covers any image without a sampled tone.
const PANEL_TONES: Record<string, string> = {
  ahmedabad: '#442f1d', auckland: '#38223f', bali: '#1b2646',
  bangkok: '#1b3146', beijing: '#461b21', bengaluru: '#1c1b46',
  brisbane: '#1a3147', cebu: '#1c3945', chennai: '#461b1e',
  chiangmai: '#192947', chiangrai: '#1a2147', colombo: '#461b32',
  copenhagen: '#1b2246', danang: '#183249', davao: '#1b2646',
  default: '#1b2546', delhi: '#472f1a', dhaka: '#3c3f22',
  doha: '#3f2231', frankfurt: '#1b3146', fukuoka: '#461b2c',
  guam: '#1b3646', guangzhou: '#1d1b46', hanoi: '#364021',
  hatyai: '#461b38', hongkong: '#1c1b46', honolulu: '#1a2b47',
  hyderabad: '#443b1d', islamabad: '#1b2846', istanbul: '#1c4045',
  jakarta: '#192447', karachi: '#182649', kathmandu: '#231948',
  khonkaen: '#1b2f46', kolkata: '#2d223f', krabi: '#1a2e47',
  kualalumpur: '#1b3346', lahore: '#1b2546', london: '#1a2f47',
  losangeles: '#181e49', manila: '#1b2b46', melbourne: '#1b2346',
  milan: '#1b2e46', mumbai: '#1b3146', munich: '#1c1b46',
  nagoya: '#46201b', newyork: '#1c3a45', osaka: '#1c4540',
  oslo: '#1b2c46', paris: '#33451c', penang: '#1c4522',
  perth: '#402139', phuket: '#1a3047', portmoresby: '#1f2f42',
  riyadh: '#492418', saigon: '#1a3147', sanfrancisco: '#192a48',
  seattle: '#183449', seoul: '#212041', shanghai: '#18492f',
  singapore: '#1a3447', stockholm: '#1b3646', sydney: '#202241',
  taipei: '#1b4533', tokyo: '#202f41', ubon: '#452d1c',
  udonthani: '#45301c', vancouver: '#1b3146', vientiane: '#2e451c',
  yangon: '#1d3f44', zurich: '#1c3a45',
};

// Default home base — never the "destination" of a rotation. The active airline's
// real base (TG=BKK, PR=MNL) is passed into tripDestination so a PR return-to-MNL
// leg is not mistaken for a "Manila" destination on the Home postcard.
const BASE = "BKK";

interface CityInfo { name: string; key: keyof typeof IMAGES }
const AIRPORTS: Record<string, CityInfo> = {
  PVG: { name: "Shanghai", key: "shanghai" },
  SHA: { name: "Shanghai", key: "shanghai" },
  CGK: { name: "Jakarta", key: "jakarta" },
  ICN: { name: "Seoul", key: "seoul" },
  GMP: { name: "Seoul", key: "seoul" },
  ARN: { name: "Stockholm", key: "stockholm" },
  DPS: { name: "Bali", key: "bali" },
  CAN: { name: "Guangzhou", key: "guangzhou" },
  FUK: { name: "Fukuoka", key: "fukuoka" },
  SIN: { name: "Singapore", key: "singapore" },
  DEL: { name: "Delhi", key: "delhi" },
  DAC: { name: "Dhaka", key: "dhaka" },
  HKG: { name: "Hong Kong", key: "hongkong" },
  HKT: { name: "Phuket", key: "phuket" },
  PEK: { name: "Beijing", key: "beijing" },
  CNX: { name: "Chiang Mai", key: "chiangmai" },
  KTM: { name: "Kathmandu", key: "kathmandu" },
  UTH: { name: "Udon Thani", key: "udonthani" },
  SYD: { name: "Sydney", key: "sydney" },
  CPH: { name: "Copenhagen", key: "copenhagen" },
  HDY: { name: "Hat Yai", key: "hatyai" },
  KIX: { name: "Osaka", key: "osaka" },
  MNL: { name: "Manila", key: "manila" },
  PEN: { name: "Penang", key: "penang" },
  SGN: { name: "Ho Chi Minh City", key: "saigon" },
  DMK: { name: "Bangkok", key: "bangkok" },
  BKK: { name: "Bangkok", key: "bangkok" },
  FRA: { name: "Frankfurt", key: "frankfurt" },
  HND: { name: "Tokyo", key: "tokyo" },
  NRT: { name: "Tokyo", key: "tokyo" },
  KHI: { name: "Karachi", key: "karachi" },
  KKC: { name: "Khon Kaen", key: "khonkaen" },
  KUL: { name: "Kuala Lumpur", key: "kualalumpur" },
  MEL: { name: "Melbourne", key: "melbourne" },
  PER: { name: "Perth", key: "perth" },
  ZRH: { name: "Zurich", key: "zurich" },
  MUC: { name: "Munich", key: "munich" },
  BLR: { name: "Bengaluru", key: "bengaluru" },
  CDG: { name: "Paris", key: "paris" },
  CEI: { name: "Chiang Rai", key: "chiangrai" },
  CMB: { name: "Colombo", key: "colombo" },
  HYD: { name: "Hyderabad", key: "hyderabad" },
  IST: { name: "Istanbul", key: "istanbul" },
  KBV: { name: "Krabi", key: "krabi" },
  MAA: { name: "Chennai", key: "chennai" },
  RGN: { name: "Yangon", key: "yangon" },
  TPE: { name: "Taipei", key: "taipei" },
  VTE: { name: "Vientiane", key: "vientiane" },
  MXP: { name: "Milan", key: "milan" },
  AMD: { name: "Ahmedabad", key: "ahmedabad" },
  BOM: { name: "Mumbai", key: "mumbai" },
  CCU: { name: "Kolkata", key: "kolkata" },
  HAN: { name: "Hanoi", key: "hanoi" },
  ISB: { name: "Islamabad", key: "islamabad" },
  LHE: { name: "Lahore", key: "lahore" },
  LHR: { name: "London", key: "london" },
  NGO: { name: "Nagoya", key: "nagoya" },
  UBP: { name: "Ubon Ratchathani", key: "ubon" },
  // PR (Philippine Airlines) network — destinations TG doesn't serve. CEB + POM
  // are from the real PR roster (crew 433535); the rest are PR's Philippine hubs
  // and long-haul network. OSL added by request. See backend/mine/cityMap.json.
  CEB: { name: "Cebu", key: "cebu" },
  POM: { name: "Port Moresby", key: "portmoresby" },
  DVO: { name: "Davao", key: "davao" },
  HNL: { name: "Honolulu", key: "honolulu" },
  GUM: { name: "Guam", key: "guam" },
  LAX: { name: "Los Angeles", key: "losangeles" },
  SFO: { name: "San Francisco", key: "sanfrancisco" },
  JFK: { name: "New York", key: "newyork" },
  YVR: { name: "Vancouver", key: "vancouver" },
  BNE: { name: "Brisbane", key: "brisbane" },
  AKL: { name: "Auckland", key: "auckland" },
  OSL: { name: "Oslo", key: "oslo" },
  // October 2026 PR roster coverage; photo provenance: scripts/data/cityPhotoSources.json.
  SEA: { name: "Seattle", key: "seattle" },
  DOH: { name: "Doha", key: "doha" },
  DAD: { name: "Da Nang", key: "danang" },
  RUH: { name: "Riyadh", key: "riyadh" },
};

export interface CityCard {
  name: string;
  airport: string;
  image: ImageSourcePropType;
  panelColor: string;
}

/** Resolve an airport code to a display city + landmark image (default fallback). */
export function cityForAirport(code: string): CityCard {
  const c = (code || "").trim().toUpperCase();
  const info = AIRPORTS[c];
  return {
    name: info ? info.name : c || "Trip",
    airport: c,
    image: info ? IMAGES[info.key] : IMAGES.default,
    panelColor: PANEL_TONES[info?.key ?? 'default'] ?? PANEL_TONES.default,
  };
}

/**
 * The destination of a flight rotation: the turnaround airport away from base.
 * For an out-and-back BKK→X→BKK that is X (the outbound arrival); for a multi-leg
 * rotation it is the first non-base arrival (where the layover is). Falls back to
 * any non-base airport, else the first leg arrival.
 */
export function tripDestination(trip: Trip, base: string = BASE): CityCard {
  const home = (base || BASE).trim().toUpperCase();
  const legs = trip.legs || [];
  const arrivals = legs.map(l => (l.arvArp || "").trim().toUpperCase());
  const firstAway = arrivals.find(a => a && a !== home);
  if (firstAway) {
    return cityForAirport(firstAway);
  }
  const anyAway = legs
    .flatMap(l => [l.depArp, l.arvArp])
    .map(a => (a || "").trim().toUpperCase())
    .find(a => a && a !== home);
  return cityForAirport(anyAway || arrivals[0] || "");
}
