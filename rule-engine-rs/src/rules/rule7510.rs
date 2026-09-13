//! Shared Rule 7510 Green-on-Green contract used by Live/Scenario/PBS adapters.

pub use crate::rule7510::{
    check_green_on_green, check_green_on_green_with_group_map, mark_green_on_green,
    mark_green_on_green_with_group_map, split_7510_list, Rule7510CrewFlight, Rule7510Mark,
    Rule7510Param, Rule7510Violation,
};
