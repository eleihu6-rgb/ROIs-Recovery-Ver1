#!/usr/bin/env python3
"""
PBS Result Analyzer — explain why specific crew got no flying / no RES duty
(ended up with only DO / leave) in a finished RO solver run.

Walks the diagnostic ladder, per crew, against a single run's artifacts:

  1. SCOPE      — is the crew in the optimization at all?      (ro_input Crew section)
  2. BIDS       — did the crew submit any bids?                 (PAIRING/RESERVE/DAYSOFF .csv)
  3. ELIGIBLE   — is the crew eligible for any pairing?         (output/crew_pairing_matrix.csv)
  4. AVAILABLE  — is the crew pre-blocked (leave/DO all month)? (result.json crew_info.preassign_tasks
                                                                 + credit_hour_report.csv)
  5. ASSIGNED   — what did the solver actually give them?       (result.json assignment / ro_output.txt)

Then prints a verdict + suggestion for each crew.

Usage:
  python3 diagnose_crew.py <run_dir> <crewId> [crewId ...]
  python3 diagnose_crew.py --scenario 541 <crewId> [crewId ...]   # auto-find latest run dir

A "run dir" is engine-server/complete/F8/<scenarioId>_<timestamp>/ (holds
PAIRING_SCORE.csv, ro_input.txt, output/result.json, ...). With --scenario it
resolves the newest <scenarioId>_* dir under engine-server/complete/F8.
"""
import csv
import datetime
import json
import os
import sys


def find_latest_run_dir(scenario_id, repo_root):
    base = os.path.join(repo_root, "engine-server", "complete", "F8")
    if not os.path.isdir(base):
        sys.exit(f"no complete/F8 dir at {base}")
    cands = [
        d for d in os.listdir(base)
        if d == str(scenario_id) or d.startswith(f"{scenario_id}_")
    ]
    if not cands:
        sys.exit(f"no run dir for scenario {scenario_id} under {base}")
    # timestamped dirs sort newest-last lexically (YYYYMMDD_HHMMSS)
    cands.sort()
    chosen = os.path.join(base, cands[-1])
    print(f"[run dir] {chosen}")
    return chosen


def count_csv_rows(path, crew):
    """rows in a *_SCORE.csv / DAYSOFF.csv whose first column == crew."""
    if not os.path.exists(path):
        return None
    n = 0
    with open(path, newline="") as f:
        r = csv.reader(f)
        next(r, None)  # header
        for row in r:
            if row and row[0] == crew:
                n += 1
    return n


def in_crew_section(ro_input, crew):
    """A crew is in scope if a data line in ro_input.txt starts with `<crew>^`."""
    if not os.path.exists(ro_input):
        return None
    needle = crew + "^"
    with open(ro_input, errors="replace") as f:
        for line in f:
            if line.startswith(needle):
                return True
    return False


def matrix_eligibility(matrix_csv, crew):
    """returns (eligible_count, max_priority_weight) from crew_pairing_matrix.csv."""
    if not os.path.exists(matrix_csv):
        return None, None
    elig = 0
    maxw = 0.0
    with open(matrix_csv, newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            if row.get("crew_id") != crew:
                continue
            if str(row.get("eligible")).lower() in ("true", "1"):
                elig += 1
            try:
                maxw = max(maxw, float(row.get("priority_weight") or 0))
            except ValueError:
                pass
    return elig, maxw


def credit_row(credit_csv, crew):
    if not os.path.exists(credit_csv):
        return None
    with open(credit_csv, newline="") as f:
        for row in csv.DictReader(f):
            if row.get("crew_id") == crew:
                return row
    return None


def load_result(result_json):
    if not os.path.exists(result_json):
        return None
    with open(result_json) as f:
        return json.load(f)


def preassign_summary(crew_info):
    pa = (crew_info or {}).get("preassign_tasks", []) or []
    if not pa:
        return 0, {}, None, None
    labels = {}
    for x in pa:
        key = f"{x.get('label', '?')}/{x.get('assignment', '?')}"
        labels[key] = labels.get(key, 0) + 1
    starts = [x["start_time_utc"] for x in pa if "start_time_utc" in x]
    ends = [x["end_time_utc"] for x in pa if "end_time_utc" in x]
    span = None
    if starts and ends:
        f = datetime.datetime.fromtimestamp(min(starts), datetime.timezone.utc).date()
        l = datetime.datetime.fromtimestamp(max(ends), datetime.timezone.utc).date()
        span = (f, l)
    return len(pa), labels, span, pa


LEAVE_LABELS = {"MLOA", "MATL", "LEAVE", "ILL", "SICK", "VAC", "BMT", "CGS"}


def diagnose(run_dir, crew):
    out = os.path.join(run_dir, "output")
    print(f"\n{'=' * 64}\nCREW {crew}\n{'=' * 64}")

    scope = in_crew_section(os.path.join(run_dir, "ro_input.txt"), crew)
    pair = count_csv_rows(os.path.join(run_dir, "PAIRING_SCORE.csv"), crew)
    res = count_csv_rows(os.path.join(run_dir, "RESERVE_SCORE.csv"), crew)
    dayoff = count_csv_rows(os.path.join(run_dir, "DAYSOFF.csv"), crew)
    elig, maxw = matrix_eligibility(os.path.join(out, "crew_pairing_matrix.csv"), crew)
    credit = credit_row(os.path.join(out, "credit_hour_report.csv"), crew)
    result = load_result(os.path.join(out, "result.json"))

    print(f"1. SCOPE     in ro_input Crew section : {scope}")
    print(f"2. BIDS      PAIRING_SCORE rows={pair}  RESERVE_SCORE rows={res}  DAYSOFF rows={dayoff}")
    print(f"3. ELIGIBLE  eligible pairings={elig}  max priority_weight={maxw}")

    span_str = leave = None
    assigned = None
    if result:
        ci = (result.get("crew_info") or {}).get(crew)
        n_pa, labels, span, _ = preassign_summary(ci)
        leave = any(k.split("/")[0] in LEAVE_LABELS for k in labels)
        span_str = f"{span[0]}..{span[1]}" if span else "n/a"
        print(f"4. AVAILABLE preassign tasks={n_pa}  labels={labels}  span={span_str}")
        if credit:
            print(f"             credit_hours={credit.get('credited_hours')}  "
                  f"target_min={credit.get('target_min')}  target_max={credit.get('target_max')}  "
                  f"preassign_rest_days={credit.get('preassign_rest_days')}")
        asg = (result.get("assignment") or {}).get(crew)
        assigned = asg
        n = len(asg) if isinstance(asg, list) else "?"
        print(f"5. ASSIGNED  solver assignment entries={n}  -> {str(asg)[:120]}")
    elif credit:
        print(f"4. AVAILABLE preassign_rest_days={credit.get('preassign_rest_days')} "
              f"(result.json missing — partial)")

    # ---- verdict ----
    print("\nVERDICT:")
    if scope is False:
        print("  ✗ NOT IN SCOPE — crew is absent from ro_input. The scenario crew filter "
              "(base/division/status) excluded them. Fix the scenario crew selection.")
        return
    if leave:
        print(f"  ✓ ON LEAVE — crew is pre-assigned leave/DO for the whole window ({span_str}). "
              "No flying is CORRECT, not a solver defect. If they should fly, correct the "
              "pre-assignment (leave record) in the source data, not the solver.")
        return
    if (pair == 0) and (res == 0):
        if elig and elig > 0:
            print("  ⚠ NO BIDS but ELIGIBLE — crew submitted no pairing/reserve bids "
                  "(priority_weight=0 everywhere). Eligible coverage crew can still be force-"
                  "assigned, but with no preference the solver deprioritizes them. ACTION: add "
                  "bids in the crew portal (skill 108) and re-run, OR confirm they are intended "
                  "reserve/standby-only.")
        else:
            print("  ✗ NO BIDS and NOT ELIGIBLE — no scored pairings and the eligibility matrix "
                  "is empty. Check base/rank/qualification vs the scenario pairings.")
        return
    if elig == 0:
        print("  ✗ NOT ELIGIBLE — crew bid, but the eligibility matrix has 0 pairings. "
              "Base / rank / qualification / date-window mismatch vs scenario pairings.")
        return
    if isinstance(assigned, list) and len(assigned) == 0:
        print("  ⚠ ELIGIBLE + AVAILABLE + BID, but solver assigned nothing. Likely rule blocks "
              "(every eligible pairing violates a hard rule), coverage already met by senior crew, "
              "or objective left them idle. Inspect output/logs and the rule connector (workset "
              "103). This is the genuine 'should fly but didn't' case worth escalating.")
    else:
        print("  ✓ Crew received assignments — re-check the gantt view / scenario id filter.")


def main():
    repo_root = os.environ.get(
        "ROIS_ROOT",
        "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS",
    )
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--scenario":
        run_dir = find_latest_run_dir(args[1], repo_root)
        crews = args[2:]
    else:
        run_dir = args[0]
        crews = args[1:]
    if not crews:
        sys.exit("give at least one crew id")
    for c in crews:
        diagnose(run_dir, c)


if __name__ == "__main__":
    main()
