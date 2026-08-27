import logging
from datetime import datetime
from typing import Any

from pymysql.cursors import DictCursor

from config import settings
from db.mysql import db_cursor, batch_nextval
from f8.client import f8_client
from f8.utils import normalize_rank, SyncResult, SyncTimer
from storage.json_store import JsonBatch

logger = logging.getLogger(__name__)

_COMMIT_BATCH = 100


def _to_mysql_datetime(val: object | None) -> datetime | None:
    """Parse F8 ISO timestamps into naive datetimes for MySQL DATETIME columns."""
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val
    elif isinstance(val, str):
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
    else:
        return None
    return dt.replace(tzinfo=None)


def _optional_mysql_datetime(val: object | None) -> datetime | None:
    """Like `_to_mysql_datetime` but returns None on empty/invalid input."""
    if val is None or val == "":
        return None
    try:
        return _to_mysql_datetime(val)
    except (ValueError, TypeError, OSError):
        return None


def _parse_seniority_num(val: object | None) -> int | None:
    """Parse F8 `seniorityNum` for MySQL `decimal(5,0)`."""
    if val is None or val == "":
        return None
    try:
        n = int(float(str(val)))
    except (TypeError, ValueError):
        return None
    if n < 0:
        return 0
    if n > 99999:
        return 99999
    return n


# `crew.division`: among ranks with the maximum `effDt`, union of codes — deck (CA/FO) wins over cabin (IFD/FA)
_DECK_RANKS = frozenset({"CA", "FO"})
_CABIN_RANKS = frozenset({"IFD", "FA"})
# Within same `effDt`, crew_rank / crew_status insert order: CA before FO, deck before cabin
_DECK_LINE_PRIORITY = {"CA": 2, "FO": 1}
_FAR_OPEN_EXP = datetime(9999, 12, 31, 23, 59, 59)


def _rank_interval_bounds(r: dict) -> tuple[datetime, datetime] | None:
    """Closed [eff, exp] for overlap checks; None if eff > exp (invalid)."""
    eff = _optional_mysql_datetime(r.get("effDt")) or datetime(1, 1, 1)
    exp = _optional_mysql_datetime(r.get("expDt")) or _FAR_OPEN_EXP
    if eff > exp:
        return None
    return eff, exp


def _intervals_overlap(a: tuple[datetime, datetime], b: tuple[datetime, datetime]) -> bool:
    return max(a[0], b[0]) <= min(a[1], b[1])


def apply_crew_rank_overlap_rules(ranks: list[dict]) -> list[dict]:
    """crew_rank / crew_status: drop FO if it overlaps any CA; drop FA if it overlaps any IFD; else unchanged."""
    ca_ivs = [_rank_interval_bounds(r) for r in ranks if str(r.get("rank", "")).strip().upper() == "CA"]
    ca_ivs = [x for x in ca_ivs if x is not None]
    ifd_ivs = [_rank_interval_bounds(r) for r in ranks if str(r.get("rank", "")).strip().upper() == "IFD"]
    ifd_ivs = [x for x in ifd_ivs if x is not None]

    drop: set[int] = set()
    for i, r in enumerate(ranks):
        rk = str(r.get("rank", "")).strip().upper()
        iv = _rank_interval_bounds(r)
        if iv is None:
            continue
        if rk == "FO" and ca_ivs:
            if any(_intervals_overlap(iv, c) for c in ca_ivs):
                drop.add(i)
        elif rk == "FA" and ifd_ivs:
            if any(_intervals_overlap(iv, z) for z in ifd_ivs):
                drop.add(i)

    return [r for i, r in enumerate(ranks) if i not in drop]


def _sort_ranks_deck_priority_then_chronology(ranks: list[dict]) -> list[dict]:
    """effDt ascending; same effDt → deck before cabin; among deck → CA before FO."""

    def sort_key(r: dict) -> tuple[datetime, int, int]:
        eff = _optional_mysql_datetime(r.get("effDt")) or datetime(1, 1, 1)
        rk = str(r.get("rank", "")).strip().upper()
        is_deck = 1 if rk in _DECK_RANKS else 0
        line = _DECK_LINE_PRIORITY.get(rk, 0)
        return (eff, -is_deck, -line)

    return sorted(ranks, key=sort_key)


def _division_from_latest_rank(ranks: list[dict]) -> str:
    """Division from ranks sharing max `effDt`: if any CA/FO → P, elif any IFD/FA → C (deck wins in mix)."""
    if not ranks:
        d = _trunc(settings.legacy_crew_division, 1)[:1]
        return d if d else " "
    floor = datetime(1, 1, 1)
    max_eff = max((_optional_mysql_datetime(r.get("effDt")) or floor) for r in ranks)
    codes: set[str] = set()
    for r in ranks:
        eff = _optional_mysql_datetime(r.get("effDt")) or floor
        if eff != max_eff:
            continue
        rk = str(r.get("rank", "")).strip().upper()
        if rk:
            codes.add(rk)
    if codes & _DECK_RANKS:
        return "P"
    if codes & _CABIN_RANKS:
        return "C"
    d = _trunc(settings.legacy_crew_division, 1)[:1]
    return d if d else " "


def _branch_code_from_division(division: str) -> str | None:
    """Map deck/cabin `division` to legacy `branch_code` (see `legacy_crew_branch_code_*`)."""
    d = (division or "").strip().upper()
    if d == "P":
        return _trunc(settings.legacy_crew_branch_code_deck, 30)
    if d == "C":
        return _trunc(settings.legacy_crew_branch_code_cabin, 30)
    return None


# Extra keys on fleet / qualification payloads that we intentionally ignore
_IGNORED_PAYLOAD_KEYS = frozenset({"crewId", "owner", "lastModifiedDt", "fleet"})


def _log_unknown_keys(crew_bid: str, label: str, invalid_keys: set[str]) -> None:
    if invalid_keys <= _IGNORED_PAYLOAD_KEYS:
        logger.debug("%s unknown keys ignored for crew %s: %s", label, crew_bid, invalid_keys)
    else:
        logger.warning("%s unknown keys skipped for crew %s: %s", label, crew_bid, invalid_keys)


VALID_FLEET_COLS = frozenset({"fleet", "effDt", "expDt"})
VALID_QUAL_COLS = frozenset({"qualification", "effDt", "expDt", "isValid"})
VALID_TEAM_COLS = frozenset({"crewId", "teamId", "teamName", "effDt", "expDt", "isValid"})


def _trunc(val: str, max_len: int) -> str:
    s = val or ""
    return s[:max_len] if len(s) > max_len else s


def _norm_gender(g: str) -> str:
    s = (g or "").strip()
    if not s:
        return "U"
    c = s[0].upper()
    return c if c in ("M", "F", "U") else "U"


def normalize_ranks_for_sync(ranks: list[dict]) -> list[dict]:
    """Normalize rank codes; keep every JSON row (no eff/expiry filtering)."""
    out: list[dict] = []
    for r in ranks:
        row = dict(r)
        row["rank"] = normalize_rank(str(row.get("rank", "")))
        out.append(row)
    return out


def filter_valid_ranks(ranks: list[dict], _ref_dt: datetime | None = None) -> list[dict]:
    """Deprecated: use `normalize_ranks_for_sync` (no date filter). Kept for older imports."""
    return normalize_ranks_for_sync(ranks)


def transform_crew_row(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "interface_id": raw["crewId"],
        "first_name": raw.get("firstName", ""),
        "middle_name": raw.get("middleName", ""),
        "last_name": raw.get("lastName", ""),
        "gender": raw.get("gender", ""),
        "telephone": raw.get("telephone", ""),
        "work_email": raw.get("workEmail", ""),
        "preferred_name": raw.get("nickName") or "",
        "birthday": _optional_mysql_datetime(raw.get("birthday")),
        "seniority_num": _parse_seniority_num(raw.get("seniorityNum")),
        "home_address": raw.get("homeAddress") or "",
        "city_of_residence": raw.get("cityOfResidence") or "",
        "state_of_residence": raw.get("stateOfResidence") or "",
        "country_of_residence": raw.get("countryOfResidence") or "",
        "postal_code": raw.get("postalCode") or "",
        "bases": raw.get("bases", []),
        "ranks": normalize_ranks_for_sync(raw.get("ranks", [])),
        "fleets": raw.get("fleets", []),
        "certificates": list(raw.get("certificates", [])),
        "qualifications": raw.get("qualifications", []),
        "teams": raw.get("teams", []),
    }


def _load_existing_crew_lookup(cursor: DictCursor) -> dict[str, int]:
    """interface_id → crew.id — loaded once to avoid per-crew SELECT."""
    cursor.execute("SELECT id, interface_id FROM crew WHERE interface_id IS NOT NULL")
    return {str(r["interface_id"]): int(r["id"]) for r in cursor.fetchall()}


def _upsert_crew(cursor: DictCursor, row: dict[str, Any], new_id: int, existing_lookup: dict[str, int]) -> str:
    """Upsert main `crew` row; returns business `crew_id` (varchar) used by child tables."""
    iface = str(row["interface_id"])[:40]
    bid = str(row["interface_id"])[:30]
    gender = _norm_gender(row["gender"])
    tel = _trunc(row["telephone"], 70)
    email = _trunc(row["work_email"], 100)
    fn = _trunc(row["first_name"], 100)
    mn = _trunc(row["middle_name"], 100)
    ln = _trunc(row["last_name"], 100)
    pref = _trunc(row.get("preferred_name", ""), 100)
    birthday = row.get("birthday")
    seniority = row.get("seniority_num")
    home = _trunc(row.get("home_address", ""), 500)
    city = _trunc(row.get("city_of_residence", ""), 50)
    state = _trunc(row.get("state_of_residence", ""), 50)
    country = _trunc(row.get("country_of_residence", ""), 12)
    postal = _trunc(row.get("postal_code", ""), 20)
    filiale = _trunc(settings.legacy_crew_filiale, 6)
    division = _division_from_latest_rank(row["ranks"])
    branch_code = _branch_code_from_division(division)

    existing_id = existing_lookup.get(iface)
    if existing_id:
        cursor.execute(
            """UPDATE crew SET first_name=%s, middle_name=%s, last_name=%s,
               preferred_name=%s, birthday=%s, seniority_num=%s,
               home_address=%s, city_of_residence=%s, state_of_residence=%s,
               country_of_residence=%s, postal_code=%s,
               gender=%s, division=%s, branch_code=%s, tel=%s, email_addr=%s, modified_by=%s, last_modified=NOW()
               WHERE id=%s""",
            (
                fn,
                mn,
                ln,
                pref,
                birthday,
                seniority,
                home,
                city,
                state,
                country,
                postal,
                gender,
                division,
                branch_code,
                tel,
                email,
                settings.migration_modified_by,
                existing_id,
            ),
        )
        return bid

    cursor.execute(
        """INSERT INTO crew (id, crew_id, first_name, middle_name, last_name,
           preferred_name, birthday, seniority_num,
           home_address, city_of_residence, state_of_residence, country_of_residence, postal_code,
           gender, division, branch_code, filiale, tel, email_addr, interface_id, modified_by, last_modified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
        (
            new_id,
            bid,
            fn,
            mn,
            ln,
            pref,
            birthday,
            seniority,
            home,
            city,
            state,
            country,
            postal,
            gender,
            division,
            branch_code,
            filiale,
            tel,
            email,
            iface,
            settings.migration_modified_by,
        ),
    )
    existing_lookup[iface] = new_id
    return bid


def _load_rank_position_lookup(cursor: DictCursor) -> dict[str, str]:
    """Map upper(rank) -> `position` from `rank_position` (first row per rank by display_order)."""
    try:
        cursor.execute(
            "SELECT `rank`, `position`, display_order FROM rank_position ORDER BY `rank` ASC, display_order ASC"
        )
        rows = cursor.fetchall()
    except Exception as e:
        logger.warning("Could not load `rank_position` lookup (%s); crew_rank.position falls back to UNK.", e)
        return {}
    out: dict[str, str] = {}
    for row in rows:
        rk = str(row.get("rank", "")).strip().upper()
        if not rk or rk in out:
            continue
        pos = row.get("position")
        out[rk] = _trunc(str(pos), 20) if pos is not None and str(pos) != "" else "UNK"
    return out


def _sync_bases(cursor: DictCursor, crew_bid: str, bases: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_base WHERE crew_id = %s", (crew_bid,))
    if not bases:
        return
    ids = batch_nextval("CREW_BASE_SEQ", len(bases), cursor)
    for i, b in enumerate(bases):
        cursor.execute(
            """INSERT INTO crew_base (id, crew_id, base, eff_dt, exp_dt, is_prime_base)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                ids[i],
                crew_bid,
                b["base"],
                _to_mysql_datetime(b["effDt"]),
                _to_mysql_datetime(b.get("expDt")),
                1 if b.get("isPrimary") else 0,
            ),
        )


def _sync_ranks(
    cursor: DictCursor,
    crew_bid: str,
    ranks: list[dict],
    rank_position: dict[str, str],
) -> None:
    cursor.execute("DELETE FROM crew_rank WHERE crew_id = %s", (crew_bid,))
    if not ranks:
        return
    ordered = _sort_ranks_deck_priority_then_chronology(ranks)
    ids = batch_nextval("CREW_RANK_SEQ", len(ordered), cursor)
    ac_def = _trunc(settings.legacy_crew_rank_default_ac_type, 20)
    grp_def = _trunc(settings.legacy_crew_rank_default_fleet_grp, 20)
    for i, r in enumerate(ordered):
        rk_key = str(r.get("rank", "")).strip().upper()
        position = rank_position.get(rk_key, "UNK")
        cursor.execute(
            """INSERT INTO crew_rank (id, crew_id, `rank`, eff_dt, exp_dt, position, pre_cumulated_exp_days,
               fleet_grp, ac_type, modified_by, last_modified)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
            (
                ids[i],
                crew_bid,
                _trunc(r["rank"], 10),
                _to_mysql_datetime(r["effDt"]),
                _to_mysql_datetime(r.get("expDt")),
                _trunc(position, 20),
                0,
                grp_def,
                ac_def,
                settings.migration_modified_by,
            ),
        )


def _sync_status(cursor: DictCursor, crew_bid: str, ranks: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_status WHERE crew_id = %s", (crew_bid,))
    if not ranks:
        return
    ordered = _sort_ranks_deck_priority_then_chronology(ranks)
    ids = batch_nextval("CREW_STS_SEQ", len(ordered), cursor)
    for i, r in enumerate(ordered):
        cursor.execute(
            """INSERT INTO crew_status (id, crew_id, status, eff_dt, exp_dt, disable, modified_by, last_modified)
               VALUES (%s,%s,'1',%s,%s,0,%s,NOW())""",
            (
                ids[i],
                crew_bid,
                _to_mysql_datetime(r["effDt"]),
                _to_mysql_datetime(r.get("expDt")),
                settings.migration_modified_by,
            ),
        )


def _sync_certificates(cursor: DictCursor, crew_bid: str, certs: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_certificate WHERE crew_id = %s", (crew_bid,))
    if not certs:
        return
    ids = batch_nextval("CREW_CERTIFICATE_SEQ", len(certs), cursor)
    for i, c in enumerate(certs):
        eff_raw = c.get("effDt") or "1970-01-01T00:00:00Z"
        is_valid = 1 if c.get("isValid") else 0
        cursor.execute(
            """INSERT INTO crew_certificate (id, crew_id, certificate, eff_dt, exp_dt, is_valid,
               modified_by, last_modified)
               VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())""",
            (
                ids[i],
                crew_bid,
                _trunc(c["certificate"], 20),
                _to_mysql_datetime(eff_raw),
                _to_mysql_datetime(c.get("expDt")),
                is_valid,
                settings.migration_modified_by,
            ),
        )


def _load_fleet_lookup(cursor: DictCursor) -> dict[str, tuple[str | None, str | None]]:
    """Load `fleet` master rows as upper(fleet_code) -> (ac_type, fleet_grp). Tries common code column names."""
    queries = (
        "SELECT fleet AS fleet_code, ac_type, fleet_grp FROM fleet",
        "SELECT fleet_specific AS fleet_code, ac_type, fleet_grp FROM fleet",
    )
    last_err: Exception | None = None
    for sql in queries:
        try:
            cursor.execute(sql)
            rows = cursor.fetchall()
            break
        except Exception as e:
            last_err = e
            rows = None
    else:
        logger.warning("Could not load `fleet` lookup (%s); crew_fleet rows will be skipped.", last_err)
        return {}

    out: dict[str, tuple[str | None, str | None]] = {}
    for row in rows:
        raw_code = row.get("fleet_code")
        if raw_code is None:
            continue
        key = str(raw_code).strip().upper()
        if not key:
            continue
        ac = row.get("ac_type")
        grp = row.get("fleet_grp")
        out[key] = (
            _trunc(str(ac), 20) if ac is not None and str(ac) != "" else None,
            _trunc(str(grp), 20) if grp is not None and str(grp) != "" else None,
        )
    if not out:
        logger.warning("`fleet` lookup query returned no rows; crew_fleet imports will be skipped.")
    return out


def _sync_fleets(
    cursor: DictCursor,
    crew_bid: str,
    fleets: list[dict],
    fleet_lookup: dict[str, tuple[str | None, str | None]],
) -> None:
    cursor.execute("DELETE FROM crew_fleet WHERE crew_id = %s", (crew_bid,))
    rows: list[tuple[str, Any, Any, str | None, str | None]] = []
    for f in fleets:
        invalid_keys = set(f.keys()) - VALID_FLEET_COLS
        if invalid_keys:
            _log_unknown_keys(crew_bid, "Fleet payload", invalid_keys)
        if "fleet" not in f or "effDt" not in f:
            continue
        code = _trunc(str(f["fleet"]), 20).strip().upper()
        if not code:
            continue
        master = fleet_lookup.get(code)
        if not master:
            logger.debug("crew_fleet skip unknown fleet %s for crew %s", code, crew_bid)
            continue
        ac_type, fleet_grp = master
        rows.append(
            (
                code,
                _to_mysql_datetime(f["effDt"]),
                _to_mysql_datetime(f.get("expDt")),
                ac_type,
                fleet_grp,
            )
        )
    if not rows:
        return
    ids = batch_nextval("CREW_FLEET_SEQ", len(rows), cursor)
    for i, (fleet_specific, eff_dt, exp_dt, ac_type, fleet_grp) in enumerate(rows):
        cursor.execute(
            """INSERT INTO crew_fleet (id, crew_id, fleet_specific, eff_dt, exp_dt, ac_type, fleet_grp)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (ids[i], crew_bid, fleet_specific, eff_dt, exp_dt, ac_type, fleet_grp),
        )


def _sync_qualifications(cursor: DictCursor, crew_bid: str, qualifications: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_qualification WHERE crew_id = %s", (crew_bid,))
    rows: list[tuple[str, Any, Any, int]] = []
    for q in qualifications:
        invalid_keys = set(q.keys()) - VALID_QUAL_COLS
        if invalid_keys:
            _log_unknown_keys(crew_bid, "Qualification payload", invalid_keys)
        if "qualification" not in q or "effDt" not in q:
            continue
        valid_flag = 1 if q.get("isValid", True) else 0
        rows.append(
            (
                _trunc(q["qualification"], 20),
                _to_mysql_datetime(q["effDt"]),
                _to_mysql_datetime(q.get("expDt")),
                valid_flag,
            )
        )
    if not rows:
        return
    ids = batch_nextval("CREW_QUAL_SEQ", len(rows), cursor)
    for i, (qual, eff_dt, exp_dt, is_valid) in enumerate(rows):
        cursor.execute(
            """INSERT INTO crew_qualification (id, crew_id, qualification, eff_dt, exp_dt, is_valid)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (ids[i], crew_bid, qual, eff_dt, exp_dt, is_valid),
        )


def _sync_teams(cursor: DictCursor, crew_bid: str, teams: list[dict]) -> None:
    cursor.execute("DELETE FROM crew_team WHERE crew_id = %s", (crew_bid,))
    rows: list[tuple[str, Any, Any, int, str | None]] = []
    for t in teams:
        invalid_keys = set(t.keys()) - VALID_TEAM_COLS
        if invalid_keys:
            _log_unknown_keys(crew_bid, "Team payload", invalid_keys)
        if "teamId" not in t or "effDt" not in t:
            continue
        team_code = _trunc(str(t["teamId"]).strip(), 50)
        if not team_code:
            continue
        rows.append(
            (
                team_code,
                _to_mysql_datetime(t["effDt"]),
                _to_mysql_datetime(t.get("expDt")),
                1 if t.get("isValid", True) else 0,
                _trunc(str(t.get("teamName") or ""), 512) or None,
            )
        )
    if not rows:
        return
    ids = batch_nextval("CREW_TEAM_SEQ", len(rows), cursor)
    for i, (team, eff_dt, exp_dt, is_valid, remarks) in enumerate(rows):
        cursor.execute(
            """INSERT INTO crew_team (id, crew_id, team, eff_dt, exp_dt, is_valid, remarks, source)
               VALUES (%s,%s,%s,%s,%s,%s,%s,'interface')""",
            (ids[i], crew_bid, team, eff_dt, exp_dt, is_valid, remarks),
        )


def sync_crew() -> SyncResult:
    timer = SyncTimer()
    timer.start()
    result = SyncResult("crew")
    batch = JsonBatch("crew")

    raw_list: list[dict] = f8_client.get_crew()
    batch.save(raw_list)
    timer.fetch_end()

    # Pre-load lookups once — eliminates per-crew SELECT in upsert
    with db_cursor() as (pre_cur, _):
        fleet_lookup = _load_fleet_lookup(pre_cur)
        rank_position = _load_rank_position_lookup(pre_cur)
        existing_lookup = _load_existing_crew_lookup(pre_cur)

    logger.info(
        "crew: %d existing crew loaded, %d fetched from API",
        len(existing_lookup), len(raw_list),
    )
    timer.import_start()

    for batch_offset in range(0, max(len(raw_list), 1), _COMMIT_BATCH):
        raw_batch = raw_list[batch_offset: batch_offset + _COMMIT_BATCH]

        with db_cursor() as (cursor, conn):
            if not raw_batch:
                break
            ids = batch_nextval("CREW_SEQ", len(raw_batch), cursor)
            for i, raw in enumerate(raw_batch):
                try:
                    row = transform_crew_row(raw)
                    crew_bid = _upsert_crew(cursor, row, ids[i], existing_lookup)
                    ranks_for_rank_table = apply_crew_rank_overlap_rules(row["ranks"])
                    _sync_bases(cursor, crew_bid, row["bases"])
                    _sync_ranks(cursor, crew_bid, ranks_for_rank_table, rank_position)
                    _sync_status(cursor, crew_bid, ranks_for_rank_table)
                    _sync_certificates(cursor, crew_bid, row["certificates"])
                    _sync_fleets(cursor, crew_bid, row["fleets"], fleet_lookup)
                    _sync_qualifications(cursor, crew_bid, row["qualifications"])
                    _sync_teams(cursor, crew_bid, row["teams"])
                    result.imported += 1
                except Exception as e:
                    msg = f"Crew {raw.get('crewId')}: error during import — {e}"
                    logger.warning(msg)
                    result.add_warning(msg)

        logger.info(
            "crew batch %d-%d / %d",
            batch_offset + 1,
            batch_offset + len(raw_batch),
            len(raw_list),
        )

    timer.import_end()
    timer.finish()
    timer.populate_result(result)
    timer.log(logger, "crew", imported=result.imported)
    return result

