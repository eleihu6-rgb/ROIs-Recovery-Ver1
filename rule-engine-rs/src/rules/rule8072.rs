//! Shared rule 8072 contract used by Live/Scenario batch binary adapters.
//!
//! 8072 is not currently wired into the PBS PyO3 rule gate list.

pub use crate::rule8072::{
    check_min_qual_by_fleet_rank, Rule8072, Rule8072Crew, Rule8072Evaluation, Rule8072Segment,
    Rule8072Violation,
};
