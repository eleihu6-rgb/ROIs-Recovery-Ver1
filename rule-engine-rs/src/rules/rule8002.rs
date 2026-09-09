//! Shared rule 8002 cumulative-limit contract used by PyO3 and batch binary adapters.

pub use crate::rule8002::{
    check_max_cumulative_row, crew_qualifies_8002, enumerate_windows, is_wildcard,
    merge_daily_with_candidate, qual_entry_from_ord, qual_matches, team_qual_entry, CumRule8002,
    CumType, CumUnit, CumViolation, DayMetrics, QualEntry, MANDAY_METRICS,
};
pub use crate::{
    check_credit_band, check_credit_band_app, check_max_cum_block, check_max_cum_block_app,
    days_in_month, CreditBandViolation, Violation,
};
