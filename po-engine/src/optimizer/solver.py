"""OR-Tools CP-SAT solver variable creation and encapsulation.

All decision variables are created here and bundled into SolverVariables
which is passed to constraint builders and the result extractor.
"""

import logging
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from src.config import settings
from src.models.flight import Flight
from src.utils.time_utils import datetime_to_minutes

logger = logging.getLogger(__name__)

# Large constant for time domain upper bound (minutes in ~2 years)
_TIME_MAX = 365 * 2 * 24 * 60


@dataclass
class SolverVariables:
    """Container for all CP-SAT decision variables."""

    max_pairings: int
    max_duties: int
    max_flights_per_duty: int

    # x[f, p] (Bool): flight f is assigned to pairing p
    x: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)

    # y[f1, f2] (Bool): flight f2 immediately follows f1 in the same duty
    y: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)

    # d[p, k] (Bool): duty k of pairing p is used
    d: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)

    # duty_start[p, k] (Int): start time of duty k in pairing p (minutes)
    duty_start: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)

    # duty_end[p, k] (Int): end time of duty k in pairing p (minutes)
    duty_end: dict[tuple[int, int], cp_model.IntVar] = field(default_factory=dict)

    # flight_in_duty[f, p, k] (Bool): flight f is in duty k of pairing p
    flight_in_duty: dict[tuple[int, int, int], cp_model.IntVar] = field(
        default_factory=dict
    )

    # first_in_pairing[f, p] (Bool): flight f is the first flight of pairing p
    first_in_pairing: dict[tuple[int, int], cp_model.IntVar] = field(
        default_factory=dict
    )

    # last_in_pairing[f, p] (Bool): flight f is the last flight of pairing p
    last_in_pairing: dict[tuple[int, int], cp_model.IntVar] = field(
        default_factory=dict
    )

    # pairing_used[p] (Bool): whether pairing p is actually used
    pairing_used: dict[int, cp_model.IntVar] = field(default_factory=dict)


def create_variables(
    model: cp_model.CpModel,
    flights: list[Flight],
    max_pairings: int | None = None,
    max_duties: int | None = None,
    max_flights_per_duty: int | None = None,
) -> SolverVariables:
    """Create all decision variables for the CP-SAT model.

    The number of potential pairings is bounded by the number of flights
    (worst case: each flight is its own pairing). We use a smaller bound
    estimated from the flight count.
    """
    n = len(flights)
    if n == 0:
        return SolverVariables(
            max_pairings=0, max_duties=0, max_flights_per_duty=0
        )

    md = max_duties or settings.max_duties_per_pairing
    mf = max_flights_per_duty or settings.max_flights_per_duty

    # Upper bound on pairings: n flights, at least 1 flight per pairing
    mp = max_pairings if max_pairings is not None else n

    logger.info(
        "Creating variables: %d flights, max %d pairings, max %d duties, "
        "max %d flights/duty",
        n, mp, md, mf,
    )

    vars_ = SolverVariables(
        max_pairings=mp, max_duties=md, max_flights_per_duty=mf
    )

    # Compute time bounds
    all_dep = [datetime_to_minutes(f.sch_dep_dt_utc) for f in flights]
    all_arv = [datetime_to_minutes(f.sch_arv_dt_utc) for f in flights]
    t_min = min(all_dep) - 120  # 2 hours buffer for brief
    t_max = max(all_arv) + 120  # 2 hours buffer for debrief

    # --- x[f, p] ---
    for f in range(n):
        for p in range(mp):
            vars_.x[(f, p)] = model.NewBoolVar(f"x_{f}_{p}")

    # --- Each flight is assigned to exactly one pairing ---
    for f in range(n):
        model.AddExactlyOne([vars_.x[(f, p)] for p in range(mp)])

    # --- y[f1, f2] ---
    # Only create y variables for flights that could feasibly connect
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            fi = flights[i]
            fj = flights[j]
            # Temporal feasibility: fj departs after fi arrives
            dep_j = datetime_to_minutes(fj.sch_dep_dt_utc)
            arv_i = datetime_to_minutes(fi.sch_arv_dt_utc)
            if dep_j <= arv_i:
                continue
            # Geographic feasibility: same airport
            if fi.arv_arp != fj.dep_arp:
                continue
            # Reasonable gap (not more than 24 hours)
            if dep_j - arv_i > 24 * 60:
                continue
            vars_.y[(i, j)] = model.NewBoolVar(f"y_{i}_{j}")

    # --- d[p, k], duty_start[p, k], duty_end[p, k] ---
    for p in range(mp):
        for k in range(md):
            vars_.d[(p, k)] = model.NewBoolVar(f"d_{p}_{k}")
            vars_.duty_start[(p, k)] = model.NewIntVar(t_min, t_max, f"ds_{p}_{k}")
            vars_.duty_end[(p, k)] = model.NewIntVar(t_min, t_max, f"de_{p}_{k}")

    # --- flight_in_duty[f, p, k] ---
    for f in range(n):
        for p in range(mp):
            for k in range(md):
                fid = model.NewBoolVar(f"fid_{f}_{p}_{k}")
                vars_.flight_in_duty[(f, p, k)] = fid
                # flight_in_duty implies x[f,p] = 1 and d[p,k] = 1
                model.AddImplication(fid, vars_.x[(f, p)])
                model.AddImplication(fid, vars_.d[(p, k)])

    # --- Each flight in a pairing belongs to exactly one duty ---
    for f in range(n):
        for p in range(mp):
            duty_assignments = [
                vars_.flight_in_duty[(f, p, k)] for k in range(md)
            ]
            # If x[f,p] = 1, exactly one duty; if x[f,p] = 0, no duty
            model.Add(sum(duty_assignments) == 1).OnlyEnforceIf(vars_.x[(f, p)])
            model.Add(sum(duty_assignments) == 0).OnlyEnforceIf(
                vars_.x[(f, p)].Not()
            )

    # --- y implies same pairing assignment ---
    for (i, j), y_var in vars_.y.items():
        for p in range(mp):
            # If y[i,j] = 1, both must be in same pairing
            b = model.NewBoolVar(f"yp_{i}_{j}_{p}")
            model.AddImplication(y_var, vars_.x[(i, p)]).OnlyEnforceIf(b)
            model.AddImplication(y_var, vars_.x[(j, p)]).OnlyEnforceIf(b)

    # --- Duty time bounds from flights ---
    for p in range(mp):
        for k in range(md):
            dk = (p, k)
            for f in range(n):
                fk = (f, p, k)
                if fk not in vars_.flight_in_duty:
                    continue
                flt = flights[f]
                dep_min = datetime_to_minutes(flt.sch_dep_dt_utc)
                arv_min = datetime_to_minutes(flt.sch_arv_dt_utc)
                brief = settings.default_brief_minutes
                debrief = settings.default_debrief_minutes

                # If flight in duty, duty starts <= dep - brief
                model.Add(
                    vars_.duty_start[dk] <= dep_min - brief
                ).OnlyEnforceIf(vars_.flight_in_duty[fk])

                # If flight in duty, duty ends >= arv + debrief
                model.Add(
                    vars_.duty_end[dk] >= arv_min + debrief
                ).OnlyEnforceIf(vars_.flight_in_duty[fk])

    # --- Duty ordering within a pairing ---
    for p in range(mp):
        for k in range(md - 1):
            dk_curr = (p, k)
            dk_next = (p, k + 1)
            # If both duties used, next duty starts after current ends
            both = model.NewBoolVar(f"dord_{p}_{k}")
            model.AddBoolAnd([vars_.d[dk_curr], vars_.d[dk_next]]).OnlyEnforceIf(both)
            model.AddBoolOr(
                [vars_.d[dk_curr].Not(), vars_.d[dk_next].Not()]
            ).OnlyEnforceIf(both.Not())
            model.Add(
                vars_.duty_start[dk_next] > vars_.duty_end[dk_curr]
            ).OnlyEnforceIf(both)

            # Duties must be used in order: if d[p,k+1] then d[p,k]
            model.AddImplication(vars_.d[dk_next], vars_.d[dk_curr])

    # --- pairing_used[p] ---
    for p in range(mp):
        pu = model.NewBoolVar(f"pu_{p}")
        vars_.pairing_used[p] = pu
        # Pairing is used if at least one duty is used
        duty_vars = [vars_.d[(p, k)] for k in range(md)]
        model.AddBoolOr(duty_vars).OnlyEnforceIf(pu)
        model.AddBoolAnd([dv.Not() for dv in duty_vars]).OnlyEnforceIf(pu.Not())

    # --- first_in_pairing / last_in_pairing ---
    for f in range(n):
        for p in range(mp):
            # first: x[f,p] = 1 AND no predecessor y[g,f] = 1
            is_first = model.NewBoolVar(f"first_{f}_{p}")
            vars_.first_in_pairing[(f, p)] = is_first

            predecessors = [
                vars_.y[(g, f)]
                for g in range(n)
                if (g, f) in vars_.y
            ]
            if predecessors:
                no_pred = model.NewBoolVar(f"nopred_{f}_{p}")
                model.AddBoolAnd([pv.Not() for pv in predecessors]).OnlyEnforceIf(
                    no_pred
                )
                model.AddBoolOr(predecessors).OnlyEnforceIf(no_pred.Not())
                model.AddBoolAnd([vars_.x[(f, p)], no_pred]).OnlyEnforceIf(is_first)
                model.AddBoolOr(
                    [vars_.x[(f, p)].Not(), no_pred.Not()]
                ).OnlyEnforceIf(is_first.Not())
            else:
                # No possible predecessors — first iff assigned to p
                model.Add(is_first == vars_.x[(f, p)])

            # last: x[f,p] = 1 AND no successor y[f,g] = 1
            is_last = model.NewBoolVar(f"last_{f}_{p}")
            vars_.last_in_pairing[(f, p)] = is_last

            successors = [
                vars_.y[(f, g)]
                for g in range(n)
                if (f, g) in vars_.y
            ]
            if successors:
                no_succ = model.NewBoolVar(f"nosucc_{f}_{p}")
                model.AddBoolAnd([sv.Not() for sv in successors]).OnlyEnforceIf(
                    no_succ
                )
                model.AddBoolOr(successors).OnlyEnforceIf(no_succ.Not())
                model.AddBoolAnd([vars_.x[(f, p)], no_succ]).OnlyEnforceIf(is_last)
                model.AddBoolOr(
                    [vars_.x[(f, p)].Not(), no_succ.Not()]
                ).OnlyEnforceIf(is_last.Not())
            else:
                model.Add(is_last == vars_.x[(f, p)])

    # --- Symmetry breaking: pairings used in order ---
    for p in range(mp - 1):
        model.AddImplication(
            vars_.pairing_used[p + 1], vars_.pairing_used[p]
        )

    logger.info(
        "Created %d x-vars, %d y-vars, %d d-vars",
        len(vars_.x),
        len(vars_.y),
        len(vars_.d),
    )

    return vars_
