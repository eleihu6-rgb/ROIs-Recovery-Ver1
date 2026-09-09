use crate::{
    check_min_space_wocl_app, check_min_space_wocl_cd_app, Application, BaseQual, WoclSpacingDuty,
    WoclSpacingViolation,
};

#[derive(Debug, Clone)]
pub struct Rule7504Row {
    pub prev_assignment_groups: Vec<String>,
    pub next_assignment_groups: Vec<String>,
    pub prev_assignments: Vec<String>,
    pub next_assignments: Vec<String>,
    pub prev_attributes: Vec<String>,
    pub next_attributes: Vec<String>,
    pub apply_prelabelled_attributes: bool,
    pub utilize_post_rest: bool,
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub level: String,
    pub min_period: i64,
    pub unit: String,
    pub wocl_window: Option<(i64, i64)>,
}

#[derive(Debug, Clone)]
pub struct Rule7504Duty {
    pub pairing_id: i64,
    pub start_utc: i64,
    pub end_duty_utc: i64,
    pub end_including_rest_utc: i64,
    pub day_ord: i64,
    pub offset_min: i64,
    pub assignment_group: String,
    pub assignment: String,
    pub attributes: String,
    pub is_pre_assigned: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Rule7504CrewContext {
    pub base_quals: Vec<BaseQual>,
    pub rank_quals: Vec<BaseQual>,
    pub fleet_quals: Vec<BaseQual>,
    pub teams: Vec<String>,
}

pub type Rule7504Violation = WoclSpacingViolation;

pub fn check_rule7504_structured(
    crew_id: &str,
    row: &Rule7504Row,
    crew: &Rule7504CrewContext,
    duties: &[Rule7504Duty],
    fallback_wocl_window: Option<(i64, i64)>,
    app: Application,
) -> Vec<Rule7504Violation> {
    let Some(window) = row.wocl_window.or(fallback_wocl_window) else {
        return Vec::new();
    };
    if !matches!(row.level.trim().to_uppercase().as_str(), "D" | "P") {
        return Vec::new();
    }

    let mut out = Vec::new();
    for pair in duties.windows(2) {
        let current = &pair[0];
        let next = &pair[1];
        let current_wocl = is_wocl(
            current.start_utc,
            current.end_duty_utc,
            current.offset_min,
            window,
        );
        let next_wocl = is_wocl(next.start_utc, next.end_duty_utc, next.offset_min, window);
        if !current_wocl
            || !next_wocl
            || !filter_matches(&row.prev_assignment_groups, &current.assignment_group)
            || !filter_matches(&row.next_assignment_groups, &next.assignment_group)
            || !filter_matches(&row.prev_assignments, &current.assignment)
            || !filter_matches(&row.next_assignments, &next.assignment)
            || !attribute_matches(
                &row.prev_attributes,
                &current.attributes,
                current_wocl,
                row.apply_prelabelled_attributes,
            )
            || !attribute_matches(
                &row.next_attributes,
                &next.attributes,
                next_wocl,
                row.apply_prelabelled_attributes,
            )
            || !scope_matches(row, crew, current.day_ord)
        {
            continue;
        }

        let current_end = if row.utilize_post_rest {
            current.end_duty_utc
        } else {
            current.end_including_rest_utc
        };
        let kernel_duties = [
            WoclSpacingDuty {
                pairing_id: current.pairing_id,
                start_utc: current.start_utc,
                end_utc: current_end,
                offset_min: current.offset_min,
            },
            WoclSpacingDuty {
                pairing_id: next.pairing_id,
                start_utc: next.start_utc,
                end_utc: next.end_duty_utc,
                offset_min: next.offset_min,
            },
        ];
        let pre_assigned = [current.is_pre_assigned, next.is_pre_assigned];
        let mut violations = if row.unit.trim().eq_ignore_ascii_case("CD") {
            check_min_space_wocl_cd_app(
                crew_id,
                &kernel_duties,
                window.0,
                window.1,
                row.min_period,
                app,
                &pre_assigned,
            )
        } else {
            check_min_space_wocl_app(
                crew_id,
                &kernel_duties,
                window.0,
                window.1,
                row.min_period,
                app,
                &pre_assigned,
            )
        };
        out.append(&mut violations);
    }
    out
}

fn filter_matches(filters: &[String], value: &str) -> bool {
    filters.is_empty()
        || filters.iter().any(|filter| {
            let filter = filter.trim();
            filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case(value)
        })
}

fn attribute_matches(
    filters: &[String],
    attributes: &str,
    computed_wocl: bool,
    apply_prelabelled: bool,
) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    if apply_prelabelled {
        return attributes
            .split(['|', ','])
            .any(|attribute| filter_matches(filters, attribute.trim()));
    }
    filters
        .iter()
        .any(|value| value.trim().eq_ignore_ascii_case("WOCL") && computed_wocl)
}

fn scope_matches(row: &Rule7504Row, crew: &Rule7504CrewContext, day_ord: i64) -> bool {
    qual_scope_matches(&row.bases, &crew.base_quals, day_ord)
        && qual_scope_matches(&row.ranks, &crew.rank_quals, day_ord)
        && qual_scope_matches(&row.fleets, &crew.fleet_quals, day_ord)
        && team_scope_matches(&row.teams, &crew.teams)
}

fn qual_scope_matches(filters: &[String], quals: &[BaseQual], day_ord: i64) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    quals.iter().any(|qual| {
        filter_matches(filters, qual.base.as_str())
            && qual.eff_ord.unwrap_or(i64::MIN) <= day_ord
            && qual.exp_ord.unwrap_or(i64::MAX) >= day_ord
    })
}

fn team_scope_matches(filters: &[String], teams: &[String]) -> bool {
    if filters.is_empty() || filters.iter().any(|value| value.trim() == "*") {
        return true;
    }
    teams.iter().any(|team| filter_matches(filters, team))
}

fn is_wocl(start_utc: i64, end_utc: i64, offset_min: i64, window: (i64, i64)) -> bool {
    let check_start = start_utc + offset_min * 60;
    let check_end = end_utc + offset_min * 60;
    let day = check_start - check_start.rem_euclid(86_400);
    let (start_min, end_min) = window;
    let ranges = if end_min >= start_min {
        [
            (day + start_min * 60, day + end_min * 60),
            (day + 86_400 + start_min * 60, day + 86_400 + end_min * 60),
        ]
    } else {
        [
            (day - 86_400 + start_min * 60, day + end_min * 60),
            (day + start_min * 60, day + 86_400 + end_min * 60),
        ]
    };
    ranges.iter().any(|(range_start, range_end)| {
        (check_start >= *range_start && check_start <= *range_end)
            || (check_end >= *range_start && check_end <= *range_end)
            || (*range_start >= check_start && *range_start <= check_end)
            || (*range_end >= check_start && *range_end <= check_end)
    })
}
