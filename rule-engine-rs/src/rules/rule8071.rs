//! Shared rule 8071 contract used by Live/Scenario batch binary adapters.
//!
//! 8071 is not currently wired into the PBS PyO3 rule gate list.

pub use crate::rule8071::{
    check_roster_properties_row, RosterPropertyActivity, Rule8071, Rule8071Mode, Rule8071Unit,
    Rule8071Violation,
};
