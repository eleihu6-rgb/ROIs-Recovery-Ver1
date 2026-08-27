#!/usr/bin/env python3
"""
Populate the `country` column in airport CSV exports using the open OurAirports
dataset (https://ourairports.com/data/airports.csv).

Example:
    python scripts/update_airport_country.py \
        --input D:/PO/SQ/airport_202511250940.csv \
        --output D:/PO/SQ/airport_202511250940_with_country.csv

The script can be reused whenever new airports are added; it always downloads
the latest reference CSV.
"""

from __future__ import annotations

import argparse
import csv
import io
import math
import sys
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


DEFAULT_SOURCE_URL = "https://ourairports.com/data/airports.csv"
OPTD_SOURCE_URL = "https://raw.githubusercontent.com/opentraveldata/opentraveldata/master/opentraveldata/optd_por_public.csv"
HARDCODED_OVERRIDES = {
    # Supplemental mappings not present in source datasets.
    "FBU": "NO",  # Oslo Fornebu (closed)
    "VEJ": "DK",  # Vejle (rail)
    "PFF": "AU",  # Parafield, Australia (YPFF)
    "JSZ": "FR",  # Saint-Tropez region ground station
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fill missing airport country codes using OurAirports data."
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to airport CSV to update.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help=(
            "Path to write the updated CSV. "
            "If omitted, the input file is overwritten."
        ),
    )
    parser.add_argument(
        "--source-url",
        default=DEFAULT_SOURCE_URL,
        help="Override the reference airports CSV URL (defaults to OurAirports).",
    )
    parser.add_argument(
        "--max-distance-km",
        type=float,
        default=80.0,
        help=(
            "Max distance (km) to allow for a lat/long fallback match "
            "when no code match is found."
        ),
    )
    parser.add_argument(
        "--no-optd",
        action="store_true",
        help="Skip loading the OpenTravelData POR dataset (includes rail/bus IATA codes).",
    )
    return parser.parse_args()


def download_reference(source_url: str) -> Tuple[Dict[str, str], List[Tuple[float, float, str, str]]]:
    """
    Download and parse the OurAirports reference data.

    Returns:
        code_map: mapping from any known code (ICAO/IATA/local) -> ISO country code.
        coords: list of (lat, lon, iso_country, ident) for proximity fallback.
    """
    with urllib.request.urlopen(source_url, timeout=30) as resp:
        text = resp.read().decode("utf-8")

    code_map: Dict[str, str] = {}
    coords: List[Tuple[float, float, str, str]] = []

    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        country = row.get("iso_country", "").strip().upper()
        if not country:
            continue

        for key in ("ident", "gps_code", "iata_code", "local_code"):
            code = row.get(key, "")
            code = code.strip().upper()
            if code:
                # Keep first-seen mapping; later duplicates are ignored.
                code_map.setdefault(code, country)

        try:
            lat = float(row["latitude_deg"])
            lon = float(row["longitude_deg"])
            coords.append((lat, lon, country, row.get("ident", "")))
        except (KeyError, TypeError, ValueError):
            continue

    return code_map, coords


def download_optd() -> Dict[str, str]:
    """
    Download OpenTravelData "POR" dataset for extended IATA coverage
    (includes rail/bus stations with IATA codes).
    """
    with urllib.request.urlopen(OPTD_SOURCE_URL, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="ignore")

    clean_lines = "\n".join(
        line for line in text.splitlines() if line and not line.startswith("#")
    )
    reader = csv.DictReader(io.StringIO(clean_lines), delimiter="^")
    code_map: Dict[str, str] = {}
    for row in reader:
        code = (row.get("iata_code") or "").strip().upper()
        country = (row.get("country_code") or "").strip().upper()
        if not code or not country:
            continue
        code_map.setdefault(code, country)
    return code_map


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Standard haversine distance on Earth (km).
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(
        dlambda / 2
    ) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def candidate_codes(row: Dict[str, str]) -> Iterable[str]:
    for field in ("airport_icao", "airport_abbr", "airport"):
        code = (row.get(field) or "").strip().upper()
        if code:
            yield code


def resolve_country(
    row: Dict[str, str],
    code_map: Dict[str, str],
    coords: List[Tuple[float, float, str, str]],
    max_distance_km: float,
    override_map: Dict[str, str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Attempt to resolve an ISO country code for the given row.

    Returns:
        (country, reason) where reason describes the lookup method.
    """
    override_key = (row.get("airport") or "").strip().upper()
    if override_key and override_key in override_map:
        return override_map[override_key], "manual override"

    for code in candidate_codes(row):
        if code in code_map:
            return code_map[code], f"matched {code}"

        if len(code) == 3:
            # Try common ICAO prefixes to convert FAA/IATA-like codes.
            for prefix in ("K", "C", "E", "Y"):
                prefixed = f"{prefix}{code}"
                if prefixed in code_map:
                    return code_map[prefixed], f"matched {prefixed} from {code}"

    try:
        lat = float(row.get("latitude", ""))
        lon = float(row.get("longitude", ""))
    except (TypeError, ValueError):
        return None, None

    best = None
    for ref_lat, ref_lon, ref_country, ref_ident in coords:
        dist = haversine_km(lat, lon, ref_lat, ref_lon)
        if best is None or dist < best[0]:
            best = (dist, ref_country, ref_ident)

        if best and best[0] <= max_distance_km:
            dist, ref_country, ref_ident = best
            return ref_country, f"nearest {ref_ident} @ {dist:.1f}km"

    dst_grp = (row.get("dst_grp") or "").strip().upper()
    if len(dst_grp) >= 2 and dst_grp[:2].isalpha():
        return dst_grp[:2], "dst_grp heuristic"

    return None, None


def load_airport_rows(input_path: Path) -> Tuple[List[Dict[str, str]], List[str]]:
    with input_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        if reader.fieldnames is None:
            raise ValueError("Input CSV has no header")
        return rows, reader.fieldnames


def write_rows(path: Path, fieldnames: List[str], rows: List[Dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    output_path = args.output or args.input

    print(f"Loading reference data from {args.source_url} ...")
    code_map, coords = download_reference(args.source_url)
    print(f"Loaded {len(code_map)} code mappings.")

    if not args.no_optd:
        print("Loading OpenTravelData POR for extended IATA coverage ...")
        optd_map = download_optd()
        before = len(code_map)
        for code, country in optd_map.items():
            code_map.setdefault(code, country)
        print(f"Added {len(code_map) - before} extra codes (total {len(code_map)}).")

    override_map = {k.upper(): v.upper() for k, v in HARDCODED_OVERRIDES.items()}
    for code, country in override_map.items():
        code_map.setdefault(code, country)

    rows, fieldnames = load_airport_rows(args.input)
    updated = 0
    unresolved: List[str] = []

    for row in rows:
        if (row.get("country") or "").strip():
            continue

        country, reason = resolve_country(
            row,
            code_map=code_map,
            coords=coords,
            max_distance_km=args.max_distance_km,
            override_map=override_map,
        )
        if country:
            row["country"] = country
            updated += 1
        else:
            unresolved.append(row.get("airport") or row.get("airport_icao") or row.get("id", ""))

    write_rows(output_path, fieldnames, rows)

    print(f"Updated {updated} rows.")
    if unresolved:
        print(f"Could not resolve {len(unresolved)} rows (see below):")
        for item in unresolved[:20]:
            print(f"  - {item}")
        if len(unresolved) > 20:
            print("  ...")
    else:
        print("All rows resolved.")

    print(f"Written to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
