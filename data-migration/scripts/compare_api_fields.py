"""Fetch 5 days of data from all F8 API endpoints and compare fields with program expectations."""
import json
import sys
import os
from datetime import date, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from f8.client import f8_client

TODAY = date.today()
START = TODAY.isoformat()
END = (TODAY + timedelta(days=4)).isoformat()

EXPECTED_FIELDS = {
    "crew": {
        "top_level": {
            "owner", "crewId", "firstName", "middleName", "lastName",
            "gender", "telephone", "workEmail",
            "bases", "ranks", "fleets", "certificates", "qualifications",
            "nickName", "birthday", "seniorityNum",
            "homeAddress", "cityOfResidence", "stateOfResidence",
            "countryOfResidence", "postalCode",
        },
        "bases[]": {"crewId", "base", "effDt", "expDt", "isPrimary"},
        "ranks[]": {"rank", "effDt", "expDt"},
        "fleets[]": {"fleet", "effDt", "expDt"},
        "certificates[]": {"certificate", "isValid", "expDt", "effDt"},
        "qualifications[]": {"qualification", "effDt", "expDt", "isValid"},
    },
    "flight": {
        "top_level": {
            "owner", "legNo", "datOp", "fltId", "depStn", "arrStn",
            "status", "std", "sta", "atd", "ata", "acGrp", "acReg",
            "fltNum",
        },
    },
    "pairing": {
        "top_level": {
            "pairingId", "pairingDt", "label", "base", "fleet",
            "durationDays", "pairingCompositions", "pairingDutyList",
            "pairingDuties", "duties",
        },
        "pairingCompositions[]": {"actingRank", "planValue", "division"},
        "pairingDutyList[]": {
            "dutyId", "dutySeq", "strArp", "arrArp", "endArp",
            "actStrDtUtc", "actEndDtUtc", "creditMin", "creditedMinutes",
            "assignment", "comments",
            "nodes", "segments", "pairingDutyNodes", "pairingDutySegments",
        },
        "duty.nodes[]": {
            "node", "startUtc", "endUtc", "airport", "arp", "sequence",
        },
        "duty.segments[]": {
            "segSeq", "dutySeq", "fltId", "fltNum", "fltDt",
            "depArp", "arvArp", "arrArp", "assignment", "airline", "fleet",
            "actStrDtUtc", "actEndDtUtc",
        },
    },
    "rosterFlight": {
        "top_level": {
            "rosterFlightId", "pairingId", "fltId", "depArp", "arrArp",
            "dutyStrUtc", "rosterId", "fltType",
            "pairingStrUtc",
            "crew",
        },
        "crew": {
            "crewId", "crewName", "actingRank", "activeRank",
            "division", "seqOrder", "assignmentGroup",
        },
    },
    "rosterGround": {
        "top_level": {
            "crewId", "startTimeUtc", "endTimeUtc", "assignment",
            "assignmentGroup", "location", "division", "label",
            "trainingRole",
        },
    },
    "manday": {
        "top_level": {
            "crewId", "crewBaseDt", "blh", "fdp", "dp", "credit",
        },
    },
}


def collect_keys(records: list[dict], nested_key: str | None = None) -> set[str]:
    keys: set[str] = set()
    for rec in records:
        if nested_key:
            items = rec.get(nested_key, [])
            if isinstance(items, dict):
                items = [items]
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        keys.update(item.keys())
        else:
            keys.update(rec.keys())
    return keys


def collect_nested_duty_keys(pairings: list[dict]) -> tuple[set[str], set[str]]:
    node_keys: set[str] = set()
    seg_keys: set[str] = set()
    for p in pairings:
        duties = p.get("pairingDutyList") or p.get("pairingDuties") or p.get("duties") or []
        for d in duties:
            for n in (d.get("pairingDutyNodes") or d.get("nodes") or []):
                if isinstance(n, dict):
                    node_keys.update(n.keys())
            for s in (d.get("pairingDutySegments") or d.get("segments") or []):
                if isinstance(s, dict):
                    seg_keys.update(s.keys())
    return node_keys, seg_keys


def compare(label: str, expected: set[str], actual: set[str]) -> dict:
    missing = expected - actual
    extra = actual - expected
    return {
        "expected": sorted(expected),
        "actual": sorted(actual),
        "missing_from_api": sorted(missing),
        "new_in_api": sorted(extra),
    }


def main():
    results = {}

    # 1. Crew
    print(f"Fetching crew...")
    crew = f8_client.get_crew()
    print(f"  -> {len(crew)} records")
    if crew:
        results["crew"] = {}
        results["crew"]["top_level"] = compare("crew", EXPECTED_FIELDS["crew"]["top_level"], collect_keys(crew))
        results["crew"]["bases[]"] = compare("crew.bases[]", EXPECTED_FIELDS["crew"]["bases[]"], collect_keys(crew, "bases"))
        results["crew"]["ranks[]"] = compare("crew.ranks[]", EXPECTED_FIELDS["crew"]["ranks[]"], collect_keys(crew, "ranks"))
        results["crew"]["fleets[]"] = compare("crew.fleets[]", EXPECTED_FIELDS["crew"]["fleets[]"], collect_keys(crew, "fleets"))
        results["crew"]["certificates[]"] = compare("crew.certificates[]", EXPECTED_FIELDS["crew"]["certificates[]"], collect_keys(crew, "certificates"))
        results["crew"]["qualifications[]"] = compare("crew.qualifications[]", EXPECTED_FIELDS["crew"]["qualifications[]"], collect_keys(crew, "qualifications"))
        print(f"  Sample record keys: {sorted(crew[0].keys())}")

    # 2. Flight
    print(f"\nFetching flight {START} ~ {END}...")
    flights = f8_client.get_flight(START, END)
    print(f"  -> {len(flights)} records")
    if flights:
        results["flight"] = {}
        results["flight"]["top_level"] = compare("flight", EXPECTED_FIELDS["flight"]["top_level"], collect_keys(flights))
        print(f"  Sample record keys: {sorted(flights[0].keys())}")

    # 3. Pairing
    print(f"\nFetching pairing {START} ~ {END}...")
    pairings = f8_client.get_pairing(START, END)
    print(f"  -> {len(pairings)} records")
    if pairings:
        results["pairing"] = {}
        results["pairing"]["top_level"] = compare("pairing", EXPECTED_FIELDS["pairing"]["top_level"], collect_keys(pairings))
        duty_key = "pairingDutyList" if "pairingDutyList" in pairings[0] else ("pairingDuties" if "pairingDuties" in pairings[0] else "duties")
        results["pairing"][f"duty_list_key"] = duty_key
        results["pairing"]["pairingCompositions[]"] = compare(
            "pairing.compositions", EXPECTED_FIELDS["pairing"]["pairingCompositions[]"],
            collect_keys(pairings, "pairingCompositions"),
        )
        duty_keys = collect_keys(pairings, duty_key)
        results["pairing"]["duties[]"] = compare("pairing.duties", EXPECTED_FIELDS["pairing"]["pairingDutyList[]"], duty_keys)
        node_keys, seg_keys = collect_nested_duty_keys(pairings)
        results["pairing"]["duty.nodes[]"] = compare("pairing.duty.nodes", EXPECTED_FIELDS["pairing"]["duty.nodes[]"], node_keys)
        results["pairing"]["duty.segments[]"] = compare("pairing.duty.segments", EXPECTED_FIELDS["pairing"]["duty.segments[]"], seg_keys)
        print(f"  Sample record keys: {sorted(pairings[0].keys())}")

    # 4. Roster Flight
    print(f"\nFetching rosterFlight {START} ~ {END}...")
    roster_flights = f8_client.get_roster_flight(START, END)
    print(f"  -> {len(roster_flights)} records")
    if roster_flights:
        results["rosterFlight"] = {}
        results["rosterFlight"]["top_level"] = compare("rosterFlight", EXPECTED_FIELDS["rosterFlight"]["top_level"], collect_keys(roster_flights))
        crew_keys = collect_keys(roster_flights, "crew")
        results["rosterFlight"]["crew"] = compare("rosterFlight.crew", EXPECTED_FIELDS["rosterFlight"]["crew"], crew_keys)
        print(f"  Sample record keys: {sorted(roster_flights[0].keys())}")
        crew_sample = roster_flights[0].get("crew", {})
        if isinstance(crew_sample, dict):
            print(f"  Sample crew keys: {sorted(crew_sample.keys())}")

    # 5. Roster Ground
    print(f"\nFetching rosterGround (Leave) {START} ~ {END}...")
    roster_ground = f8_client.get_roster_ground(START, END, "Leave")
    print(f"  -> {len(roster_ground)} records (Leave only)")
    if roster_ground:
        results["rosterGround"] = {}
        results["rosterGround"]["top_level"] = compare("rosterGround", EXPECTED_FIELDS["rosterGround"]["top_level"], collect_keys(roster_ground))
        print(f"  Sample record keys: {sorted(roster_ground[0].keys())}")

    # 6. Manday
    print(f"\nFetching manday {START} 00:00:00 ~ {END} 23:59:59...")
    manday = f8_client.get_manday(f"{START} 00:00:00", f"{END} 23:59:59")
    print(f"  -> {len(manday)} records")
    if manday:
        results["manday"] = {}
        results["manday"]["top_level"] = compare("manday", EXPECTED_FIELDS["manday"]["top_level"], collect_keys(manday))
        print(f"  Sample record keys: {sorted(manday[0].keys())}")

    # Print summary
    print("\n" + "=" * 80)
    print("FIELD COMPARISON SUMMARY")
    print("=" * 80)

    has_diff = False
    for endpoint, sections in results.items():
        for section, data in sections.items():
            if isinstance(data, str):
                print(f"\n[{endpoint}] {section} = {data}")
                continue
            missing = data.get("missing_from_api", [])
            extra = data.get("new_in_api", [])
            if missing or extra:
                has_diff = True
                print(f"\n[{endpoint}] {section}:")
                if missing:
                    print(f"  MISSING from API (program expects but API doesn't return):")
                    for f in missing:
                        print(f"    - {f}")
                if extra:
                    print(f"  NEW in API (API returns but program doesn't use):")
                    for f in extra:
                        print(f"    + {f}")

    if not has_diff:
        print("\nNo field differences found!")

    # Save detailed results
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "field_comparison.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nDetailed results saved to: {out_path}")

    # Save sample records
    samples = {}
    if crew:
        samples["crew"] = crew[0]
    if flights:
        samples["flight"] = flights[0]
    if pairings:
        samples["pairing"] = pairings[0]
    if roster_flights:
        samples["rosterFlight"] = roster_flights[0]
    if roster_ground:
        samples["rosterGround"] = roster_ground[0]
    if manday:
        samples["manday"] = manday[0]

    sample_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_samples.json")
    with open(sample_path, "w") as f:
        json.dump(samples, f, indent=2, default=str, ensure_ascii=False)
    print(f"Sample records saved to: {sample_path}")


if __name__ == "__main__":
    main()
