//! Shared Rule 7505 Minimum Days Off contract used by PyO3 and binaries.

pub use crate::{
    check_min_days_off, check_min_days_off_app, count_assignment_days,
    filter_days_off_rows_for_crew, parse_check_7505_input, scope_matches_7505,
    unrestricted_assignment_day_filters, Activity7505, CrewScope7505, DaysOffRow, DaysOffScope,
    MinDaysOffViolation, Parsed7505Input, ScopedDaysOffRow,
};
