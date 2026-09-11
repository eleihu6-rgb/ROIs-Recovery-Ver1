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
};

export interface CityCard {
  name: string;
  airport: string;
  image: ImageSourcePropType;
}

/** Resolve an airport code to a display city + landmark image (default fallback). */
export function cityForAirport(code: string): CityCard {
  const c = (code || "").trim().toUpperCase();
  const info = AIRPORTS[c];
  return {
    name: info ? info.name : c || "Trip",
    airport: c,
    image: info ? IMAGES[info.key] : IMAGES.default,
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
