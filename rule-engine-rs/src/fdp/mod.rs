//! C++-faithful duty FDP calculation (`CustomBiz::calculateDutyFdp`) plus
//! rule 2107 BASIC_DEFINITION switches, rule 2102 long-transit, and rule 3010
//! DUTY BRIEF/DEBRIEF fill when nodes are missing.
//!
//! Seconds in, minutes stored via integer `/ 60` (C++ `setFDPInSecs`).

pub mod io;

use std::collections::HashMap;

/// 2107 BASIC_DEFINITION switches used by `calculateDutyFdp`.
#[derive(Debug, Clone, PartialEq)]
pub struct FdpBasicDefinition {
    pub include_ci: bool,
    pub include_co: bool,
    pub pickup_count: bool,
    pub dropoff_count: bool,
    pub pre_ferry_count: bool,
    pub include_last_dhd: bool,
    pub include_lt_ci: bool,
    pub include_lt_co: bool,
    pub include_lt_pickup: bool,
    pub include_lt_dropoff: bool,
    pub include_lt_break: bool,
    pub use_stick_time: bool,
    pub include_pre_sby: bool,
    pub include_post_sby: bool,
    pub include_pre_ground: bool,
    pub include_post_ground: bool,
    pub include_pre_stay: bool,
    pub include_post_stay: bool,
    pub include_pre_hsb: bool,
    pub include_post_hsb: bool,
    pub fixed_extension_min: i64,
    pub before_fixed_extension_min: i64,
    pub post_activity_threshold_min: i64,
    pub min_connection_time_min: i64,
}

impl Default for FdpBasicDefinition {
    fn default() -> Self {
        Self {
            include_ci: false,
            include_co: false,
            pickup_count: false,
            dropoff_count: false,
            pre_ferry_count: false,
            include_last_dhd: false,
            include_lt_ci: false,
            include_lt_co: false,
            include_lt_pickup: false,
            include_lt_dropoff: false,
            include_lt_break: false,
            use_stick_time: false,
            include_pre_sby: false,
            include_post_sby: false,
            include_pre_ground: false,
            include_post_ground: false,
            include_pre_stay: false,
            include_post_stay: false,
            include_pre_hsb: false,
            include_post_hsb: false,
            fixed_extension_min: 0,
            before_fixed_extension_min: 0,
            post_activity_threshold_min: 0,
            min_connection_time_min: 0,
        }
    }
}

impl FdpBasicDefinition {
    /// Typical F8 first-seed: INCLUDE CI=Y, INCLUDE CO=N.
    pub fn seed_wildcard() -> Self {
        Self {
            include_ci: true,
            ..Self::default()
        }
    }

    pub fn set_definition(&mut self, definition: &str, value: &str) {
        let y = value.trim().eq_ignore_ascii_case("Y");
        match definition.trim().to_ascii_uppercase().as_str() {
            "IS PICKUP COUNT" => self.pickup_count = y,
            "IS DROPOFF COUNT" => self.dropoff_count = y,
            "IS PRE-FERRY COUNT" => self.pre_ferry_count = y,
            "IS POST-FERRY COUNT" => self.include_last_dhd = y,
            "INCLUDE CHECK OUT" => self.include_co = y,
            "INCLUDE CHECK IN" => self.include_ci = y,
            "INCLUDE LT CHECK OUT" => self.include_lt_co = y,
            "INCLUDE LT CHECK IN" => self.include_lt_ci = y,
            "IS LT PICKUP COUNT" => self.include_lt_pickup = y,
            "IS LT DROPOFF COUNT" => self.include_lt_dropoff = y,
            "INCLUDE BREAK" => self.include_lt_break = y,
            "USE STICK TIME" => self.use_stick_time = y,
            "FIXED EXTENSTION" | "FIXED EXTENSION" => {
                self.fixed_extension_min = parse_i64(value);
            }
            "FIXED BEFORE EXTENSTION" | "FIXED BEFORE EXTENSION" => {
                self.before_fixed_extension_min = parse_i64(value);
            }
            "POST_ACTIVITY_THRESHOLD" => {
                self.post_activity_threshold_min = parse_i64(value);
            }
            "MIN CONNECTION TIME" => {
                self.min_connection_time_min = parse_i64(value);
            }
            "IS PRE-CSB COUNT" => self.include_pre_sby = y,
            "IS POST-CSB COUNT" => self.include_post_sby = y,
            "IS PRE-GROUND COUNT" => self.include_pre_ground = y,
            "IS POST-GROUND COUNT" => self.include_post_ground = y,
            "IS PRE-STAY COUNT" => self.include_pre_stay = y,
            "IS POST-STAY COUNT" => self.include_post_stay = y,
            "IS PRE-HSB COUNT" => self.include_pre_hsb = y,
            "IS POST-HSB COUNT" => self.include_post_hsb = y,
            _ => {}
        }
    }
}

/// Rule 3010 CHECK_IN_OUT minutes used only when DUTY BRIEF/DEBRIEF nodes are missing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CheckInOutParams {
    pub brief_min: i64,
    pub debrief_min: i64,
}

impl Default for CheckInOutParams {
    fn default() -> Self {
        Self {
            brief_min: 60,
            debrief_min: 15,
        }
    }
}

/// One 2102 MAX_TRANSIT / long-transit row.
#[derive(Debug, Clone, PartialEq)]
pub struct LongTransitRow {
    pub inbound: String,
    pub outbound: String,
    pub airport: String,
    pub fleets: Vec<String>,
    pub in_assignment: String,
    pub out_assignment: String,
    pub max_turn_time_min: i64,
    pub max_turn_time_upper_min: i64,
    pub has_max_turn_time_range: bool,
    pub pseudo_ci_min: i64,
    pub pseudo_co_min: i64,
    pub pseudo_pickup_min: i64,
    pub pseudo_dropoff_min: i64,
    pub is_split_duty: bool,
}

impl Default for LongTransitRow {
    fn default() -> Self {
        Self {
            inbound: "*".into(),
            outbound: "*".into(),
            airport: "*".into(),
            fleets: vec!["*".into()],
            in_assignment: "*".into(),
            out_assignment: "*".into(),
            max_turn_time_min: 120,
            max_turn_time_upper_min: -1,
            has_max_turn_time_range: false,
            pseudo_ci_min: 30,
            pseudo_co_min: 30,
            pseudo_pickup_min: 0,
            pseudo_dropoff_min: 0,
            is_split_duty: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AssignmentSpec {
    pub name: String,
    pub fdp_pct: f64,
    pub groups: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct FdpContext {
    pub basic: FdpBasicDefinition,
    pub long_transits: Vec<LongTransitRow>,
    pub assignments: HashMap<String, AssignmentSpec>,
    pub checkin: CheckInOutParams,
}

impl FdpContext {
    pub fn with_fly_assignment(fdp_pct: f64) -> Self {
        let mut ctx = Self::default();
        ctx.add_assignment("FLY", fdp_pct, &["FLY"]);
        ctx
    }

    pub fn add_assignment(&mut self, name: &str, fdp_pct: f64, groups: &[&str]) {
        let spec = AssignmentSpec {
            name: name.to_string(),
            fdp_pct,
            groups: groups.iter().map(|g| (*g).to_string()).collect(),
        };
        self.assignments.insert(name.to_string(), spec);
    }

    fn fdp_pct(&self, assignment: &str) -> Option<f64> {
        self.assignments.get(assignment).map(|a| a.fdp_pct)
    }

    fn in_group(&self, assignment: &str, group: &str) -> bool {
        self.assignments
            .get(assignment)
            .map(|a| a.groups.iter().any(|g| g == group))
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct DutyNode {
    pub node_type: String,
    pub node: String,
    pub start_loc: i64,
    pub end_loc: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub from_segment_id: i64,
    pub to_segment_id: i64,
}

impl DutyNode {
    pub fn duty(node: &str, start: i64, end: i64) -> Self {
        Self {
            node_type: "DUTY".into(),
            node: node.into(),
            start_loc: start,
            end_loc: end,
            start_utc: start,
            end_utc: end,
            from_segment_id: 0,
            to_segment_id: 0,
        }
    }

    fn duration_loc(&self) -> i64 {
        (self.end_loc - self.start_loc).max(0)
    }

    fn start_utc_act(&self) -> i64 {
        if self.start_utc != 0 {
            self.start_utc
        } else {
            self.start_loc
        }
    }

    fn end_utc_act(&self) -> i64 {
        if self.end_utc != 0 {
            self.end_utc
        } else {
            self.end_loc
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FdpSegment {
    pub db_id: i64,
    pub assignment: String,
    pub start_utc_act: i64,
    pub end_utc_act: i64,
    pub start_utc_sch: i64,
    pub end_utc_sch: i64,
    pub blk_seconds: i64,
    pub is_operating: bool,
    pub flt_sts: String,
    pub dep: String,
    pub arr: String,
    pub fleet: String,
    pub fleet_grp: String,
    pub dom_int: String,
}

impl FdpSegment {
    pub fn fly(db_id: i64, start: i64, end: i64) -> Self {
        Self {
            db_id,
            assignment: "FLY".into(),
            start_utc_act: start,
            end_utc_act: end,
            start_utc_sch: start,
            end_utc_sch: end,
            blk_seconds: 0,
            is_operating: true,
            flt_sts: String::new(),
            dep: "AAA".into(),
            arr: "BBB".into(),
            fleet: "ANY".into(),
            fleet_grp: String::new(),
            dom_int: "*".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FdpDuty {
    pub duty_key: String,
    pub assignment_group: String,
    pub pairing_id: i64,
    pub duty_seq: i32,
    pub crew_id: String,
    pub rest_facility: i32,
    pub composition_name: String,
    pub fleet_grp: String,
    pub checkin_local: i64,
    pub dep_local: i64,
    pub start_utc: i64,
    pub end_utc: i64,
    pub fdp_discretion_min: i64,
    pub discretion_types: Vec<String>,
    pub ts_flags: Vec<String>,
    pub crew_base: String,
    pub first_dep_is_crew_base: bool,
    pub pln_fdp_min: Option<i64>,
    pub times_calculated: bool,
    pub is_manual_modify: bool,
    pub segments: Vec<FdpSegment>,
    pub nodes: Vec<DutyNode>,
}

impl Default for FdpDuty {
    fn default() -> Self {
        Self {
            duty_key: String::new(),
            assignment_group: "FLY".into(),
            pairing_id: 0,
            duty_seq: 1,
            crew_id: String::new(),
            rest_facility: 0,
            composition_name: String::new(),
            fleet_grp: String::new(),
            checkin_local: 0,
            dep_local: 0,
            start_utc: 0,
            end_utc: 0,
            fdp_discretion_min: 0,
            discretion_types: Vec::new(),
            ts_flags: Vec::new(),
            crew_base: String::new(),
            first_dep_is_crew_base: false,
            pln_fdp_min: None,
            times_calculated: false,
            is_manual_modify: false,
            segments: Vec::new(),
            nodes: Vec::new(),
        }
    }
}

fn parse_i64(value: &str) -> i64 {
    value.trim().parse().unwrap_or(0)
}

fn wildcard_eq(filter: &str, value: &str) -> bool {
    let f = filter.trim();
    f.is_empty() || f == "*" || f == value
}

fn fleet_matches(fleets: &[String], fleet: &str) -> bool {
    if fleets.is_empty() {
        return true;
    }
    if fleets[0] == "*" {
        return true;
    }
    fleets.iter().any(|f| f == fleet)
}

fn stick_duration_seconds(seg: &FdpSegment) -> i64 {
    let blk = if seg.blk_seconds > 0 {
        seg.blk_seconds
    } else {
        seg.end_utc_act - seg.start_utc_act
    };
    blk.max(0)
}

fn assumed_arrival_utc(seg: &FdpSegment, use_stick: bool) -> i64 {
    if use_stick {
        seg.start_utc_act + stick_duration_seconds(seg)
    } else {
        seg.end_utc_act
    }
}

fn has_fdp_pct(ctx: &FdpContext, assignment: &str) -> bool {
    ctx.fdp_pct(assignment).map(|p| p > 0.0).unwrap_or(false)
}

/// C++ `Utility::findBeforeFdpSeg` — returns true at end of loop even when none found.
fn find_before_fdp_seg(i: usize, duty: &FdpDuty, ctx: &FdpContext) -> bool {
    let mut idx = i as i64;
    while idx >= 0 {
        if has_fdp_pct(ctx, &duty.segments[idx as usize].assignment) {
            return true;
        }
        idx -= 1;
    }
    true
}

fn find_after_fdp_seg(i: usize, duty: &FdpDuty, ctx: &FdpContext) -> bool {
    for seg in duty.segments.iter().skip(i) {
        if has_fdp_pct(ctx, &seg.assignment) {
            return true;
        }
    }
    false
}

fn match_long_transit_max_turn(transit_min: i64, row: &LongTransitRow) -> bool {
    if row.has_max_turn_time_range {
        transit_min >= row.max_turn_time_min && transit_min <= row.max_turn_time_upper_min
    } else {
        transit_min >= row.max_turn_time_min
    }
}

/// C++ `RuleParams::getTransit` — last matching row with the largest `maxTurnTimeMins`.
pub fn get_transit<'a>(
    ctx: &'a FdpContext,
    seg1: &FdpSegment,
    seg2: &FdpSegment,
) -> Option<&'a LongTransitRow> {
    let transit = (seg2.start_utc_act - seg1.end_utc_act) / 60;
    let mut result: Option<&LongTransitRow> = None;
    let mut selected_lower = -1i64;
    for row in &ctx.long_transits {
        if !wildcard_eq(&row.inbound, &seg1.dom_int) {
            continue;
        }
        if !wildcard_eq(&row.outbound, &seg2.dom_int) {
            continue;
        }
        if !wildcard_eq(&row.airport, &seg1.arr) {
            continue;
        }
        if !fleet_matches(&row.fleets, &seg1.fleet) {
            continue;
        }
        let act_rest = transit
            - row.pseudo_ci_min
            - row.pseudo_co_min
            - row.pseudo_pickup_min
            - row.pseudo_dropoff_min;
        if match_long_transit_max_turn(transit, row)
            && act_rest > 0
            && row.max_turn_time_min >= selected_lower
        {
            if !wildcard_eq(&row.in_assignment, &seg1.assignment) {
                continue;
            }
            if !wildcard_eq(&row.out_assignment, &seg2.assignment) {
                continue;
            }
            result = Some(row);
            selected_lower = row.max_turn_time_min;
        }
    }
    result
}

pub fn get_long_transit<'a>(
    ctx: &'a FdpContext,
    seg1: &FdpSegment,
    seg2: &FdpSegment,
) -> Option<&'a LongTransitRow> {
    get_transit(ctx, seg1, seg2).filter(|t| t.is_split_duty)
}

fn counts_toward_fdp(
    ctx: &FdpContext,
    duty: &FdpDuty,
    i: usize,
    after: bool,
) -> bool {
    let ass = &duty.segments[i].assignment;
    if has_fdp_pct(ctx, ass) {
        return true;
    }
    let b = &ctx.basic;
    if after {
        (ctx.in_group(ass, "FERRY") && b.pre_ferry_count && find_after_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "FERRY") && b.include_last_dhd && find_before_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "CSB") && b.include_pre_sby && find_after_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "CSB") && b.include_post_sby && find_before_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "GND") && b.include_pre_ground && find_after_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "GND") && b.include_post_ground && find_before_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "STAY") && b.include_pre_stay && find_after_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "STAY") && b.include_post_stay && find_before_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "HSB") && b.include_pre_hsb && find_after_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "HSB") && b.include_post_hsb && find_before_fdp_seg(i, duty, ctx))
    } else {
        (ctx.in_group(ass, "FERRY") && b.pre_ferry_count && find_before_fdp_seg(i, duty, ctx))
            || (ctx.in_group(ass, "CSB") && b.include_pre_sby)
            || (ctx.in_group(ass, "GND") && b.include_pre_ground)
            || (ctx.in_group(ass, "STAY") && b.include_pre_stay)
            || (ctx.in_group(ass, "HSB") && b.include_pre_hsb)
    }
}

fn zero_pct_still_counts(ctx: &FdpContext, duty: &FdpDuty, i: usize) -> bool {
    let ass = &duty.segments[i].assignment;
    let b = &ctx.basic;
    (ctx.in_group(ass, "FERRY") && b.include_last_dhd && find_before_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "FERRY") && b.pre_ferry_count && find_after_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "CSB") && b.include_pre_sby && find_after_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "CSB") && b.include_post_sby && find_before_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "GND") && b.include_pre_ground && find_after_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "GND") && b.include_post_ground && find_before_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "STAY") && b.include_pre_stay && find_after_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "STAY") && b.include_post_stay && find_before_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "HSB") && b.include_pre_hsb && find_after_fdp_seg(i, duty, ctx))
        || (ctx.in_group(ass, "HSB") && b.include_post_hsb && find_before_fdp_seg(i, duty, ctx))
}

fn last_fdp_segment_index(duty: &FdpDuty, ctx: &FdpContext) -> Option<usize> {
    duty.segments
        .iter()
        .enumerate()
        .rev()
        .find(|(_, s)| has_fdp_pct(ctx, &s.assignment))
        .map(|(i, _)| i)
}

/// Fill DUTY BRIEF / DEBRIEF from 3010 minutes when those nodes are missing.
pub fn fill_3010_nodes(duty: &mut FdpDuty, params: CheckInOutParams) {
    if duty.segments.is_empty() {
        return;
    }
    let first = &duty.segments[0];
    let last = duty.segments.last().unwrap();
    let has_brief = duty
        .nodes
        .iter()
        .any(|n| n.node_type == "DUTY" && n.node == "BRIEF");
    let has_debrief = duty
        .nodes
        .iter()
        .any(|n| n.node_type == "DUTY" && n.node == "DEBRIEF");
    if !has_brief && params.brief_min > 0 {
        let end = first.start_utc_act;
        let start = end - params.brief_min * 60;
        duty.nodes.push(DutyNode::duty("BRIEF", start, end));
    }
    if !has_debrief && params.debrief_min > 0 {
        let start = last.end_utc_act;
        let end = start + params.debrief_min * 60;
        duty.nodes.push(DutyNode::duty("DEBRIEF", start, end));
    }
}

/// C++ `calculateDutyFdp` — returns FDP in **seconds**.
pub fn calculate_duty_fdp(duty: &FdpDuty, ctx: &FdpContext) -> i64 {
    if duty.segments.is_empty() {
        return 0;
    }
    let has_fdp = duty
        .segments
        .iter()
        .any(|s| has_fdp_pct(ctx, &s.assignment));
    if !has_fdp {
        return 0;
    }

    let b = &ctx.basic;
    let min_connection_secs = b.min_connection_time_min * 60;
    let mut fdp: i64 = 0;

    for node in &duty.nodes {
        if node.node_type != "DUTY" {
            continue;
        }
        let add = match node.node.as_str() {
            "BRIEF" if b.include_ci => true,
            "DEBRIEF" if b.include_co => true,
            "DROPOFF" if b.dropoff_count => true,
            "PICKUP" if b.pickup_count => true,
            _ => false,
        };
        if add {
            fdp += node.duration_loc();
        }
    }

    for node in &duty.nodes {
        if node.node_type != "SEGMENT" {
            continue;
        }
        let node_match_seg = duty
            .segments
            .iter()
            .any(|s| s.db_id == node.to_segment_id);
        if !node_match_seg {
            continue;
        }
        let add = match node.node.as_str() {
            "BRIEF" if b.include_lt_ci => true,
            "DEBRIEF" if b.include_lt_co => true,
            "DROPOFF" if b.dropoff_count => true,
            "PICKUP" if b.pickup_count => true,
            _ => false,
        };
        if add {
            fdp += node.duration_loc();
        }
    }

    for i in 0..duty.segments.len() {
        let mut now_seg = false;
        let mut pre_seg = false;
        if i > 0 {
            now_seg = counts_toward_fdp(ctx, duty, i, true);
            pre_seg = has_fdp_pct(ctx, &duty.segments[i - 1].assignment)
                || counts_toward_fdp(ctx, duty, i - 1, false);
        }

        let mut brief_between: Option<&DutyNode> = None;
        let mut debrief_between: Option<&DutyNode> = None;
        if i > 0 {
            for node in &duty.nodes {
                if node.node_type != "SEGMENT" {
                    continue;
                }
                if node.node == "BRIEF" && node.to_segment_id == duty.segments[i].db_id {
                    brief_between = Some(node);
                }
                if node.node == "DEBRIEF" && node.from_segment_id == duty.segments[i - 1].db_id {
                    debrief_between = Some(node);
                }
            }
        }

        if brief_between.is_some() && debrief_between.is_some() {
            if b.include_lt_break {
                let brief = brief_between.unwrap();
                let debrief = debrief_between.unwrap();
                fdp += brief.start_utc_act() - debrief.end_utc_act();
            }
        } else if (brief_between.is_none() || debrief_between.is_none())
            && i != 0
            && now_seg
            && pre_seg
        {
            if min_connection_secs > 0 {
                let mut connection =
                    duty.segments[i].start_utc_act - assumed_arrival_utc(&duty.segments[i - 1], b.use_stick_time);
                if connection < 0 {
                    connection = 0;
                }
                fdp += connection.max(min_connection_secs);
            } else if let Some(lt) = get_long_transit(ctx, &duty.segments[i - 1], &duty.segments[i])
            {
                let blank = duty.segments[i].start_utc_act - duty.segments[i - 1].end_utc_act;
                let pseudo = (lt.pseudo_ci_min
                    + lt.pseudo_co_min
                    + lt.pseudo_dropoff_min
                    + lt.pseudo_pickup_min)
                    * 60;
                if blank > pseudo {
                    if b.include_lt_ci {
                        fdp += lt.pseudo_ci_min * 60;
                    }
                    if b.include_lt_co {
                        fdp += lt.pseudo_co_min * 60;
                    }
                    if b.include_lt_dropoff {
                        fdp += lt.pseudo_dropoff_min * 60;
                    }
                    if b.include_lt_pickup {
                        fdp += lt.pseudo_pickup_min * 60;
                    }
                    if b.include_lt_break {
                        fdp += blank
                            - lt.pseudo_ci_min * 60
                            - lt.pseudo_co_min * 60
                            - lt.pseudo_dropoff_min * 60
                            - lt.pseudo_pickup_min * 60;
                    }
                } else {
                    fdp += blank;
                }
                fdp += duty.segments[i].start_utc_act - duty.segments[i].start_utc_sch;
            } else {
                fdp += duty.segments[i].start_utc_act - duty.segments[i - 1].end_utc_act;
            }
        }

        let seg = &duty.segments[i];
        let pct = ctx.fdp_pct(&seg.assignment).unwrap_or(0.0);
        if pct == 0.0 {
            if zero_pct_still_counts(ctx, duty, i) {
                let mut segment_seconds = if b.use_stick_time {
                    stick_duration_seconds(seg)
                } else {
                    seg.end_utc_act - seg.start_utc_act
                };
                if segment_seconds <= 0 {
                    segment_seconds = seg.end_utc_act - seg.start_utc_act;
                }
                fdp += segment_seconds;
            }
            continue;
        }
        let mut segment_seconds = if b.use_stick_time {
            stick_duration_seconds(seg)
        } else {
            seg.end_utc_act - seg.start_utc_act
        };
        if segment_seconds <= 0 {
            segment_seconds = seg.end_utc_act - seg.start_utc_act;
        }
        fdp += (segment_seconds as f64 * pct) as i64;
    }

    fdp += 60 * b.fixed_extension_min + 60 * b.before_fixed_extension_min;

    if b.post_activity_threshold_min > 0 {
        if let Some(last_i) = last_fdp_segment_index(duty, ctx) {
            if last_i + 1 < duty.segments.len() {
                let transit = duty.segments[last_i + 1].start_utc_act - duty.segments[last_i].end_utc_act;
                fdp += transit.min(b.post_activity_threshold_min * 60);
            }
        }
    }
    fdp
}

/// C++ `calculatePairingDutyTimes(Duty*)` FDP write: fill 3010 nodes if needed, then
/// overwrite `_plnFDP` with `calculateDutyFdp / 60`. Sets `times_calculated`.
pub fn calculate_pairing_duty_times(duty: &mut FdpDuty, ctx: &FdpContext) {
    if duty.times_calculated {
        return;
    }
    fill_3010_nodes(duty, ctx.checkin);
    let secs = calculate_duty_fdp(duty, ctx);
    duty.pln_fdp_min = Some(secs / 60);
    duty.times_calculated = true;
    if duty.checkin_local == 0 {
        if let Some(brief) = duty
            .nodes
            .iter()
            .find(|n| n.node_type == "DUTY" && n.node == "BRIEF")
        {
            duty.checkin_local = brief.start_loc;
        } else if let Some(first) = duty.segments.first() {
            duty.checkin_local = first.start_utc_act;
        }
    }
    if duty.dep_local == 0 {
        if let Some(first) = duty.segments.first() {
            duty.dep_local = first.start_utc_act;
        }
    }
    if duty.start_utc == 0 {
        duty.start_utc = duty.checkin_local;
    }
    if duty.end_utc == 0 {
        if let Some(debrief) = duty
            .nodes
            .iter()
            .find(|n| n.node_type == "DUTY" && n.node == "DEBRIEF")
        {
            duty.end_utc = debrief.end_loc;
        } else if let Some(last) = duty.segments.last() {
            duty.end_utc = last.end_utc_act;
        }
    }
}

/// FLY + uncomputed (`pln_fdp_min` is None): calculate once. RES/GRD skip.
pub fn ensure_fly_fdp(duty: &mut FdpDuty, ctx: &FdpContext) {
    if duty.assignment_group != "FLY" {
        return;
    }
    if duty.pln_fdp_min.is_some() {
        duty.times_calculated = true;
        return;
    }
    calculate_pairing_duty_times(duty, ctx);
}

pub fn hhmm_to_minutes(raw: &str) -> i64 {
    let s = raw.trim();
    if s.is_empty() || s == "*" {
        return 0;
    }
    if let Some((h, m)) = s.split_once(':') {
        let hh: i64 = h.parse().unwrap_or(0);
        let mm: i64 = m.parse().unwrap_or(0);
        let neg = s.starts_with('-');
        let mag = hh.abs() * 60 + mm;
        if neg {
            -mag
        } else {
            mag
        }
    } else {
        s.parse().unwrap_or(0)
    }
}

pub fn minutes_to_hhmm(minutes: i64) -> String {
    let neg = minutes < 0;
    let abs = minutes.abs();
    let body = format!("{:02}:{:02}", abs / 60, abs % 60);
    if neg {
        format!("-{body}")
    } else {
        body
    }
}

/// C++ `TimeUtils::IsTimesInRange(time_t, startHHmm, endHHmm)` — minutes-of-UTC-day.
pub fn is_times_in_range(check_utc: i64, start_hhmm: i64, end_hhmm: i64) -> bool {
    let hhmm = ((check_utc % 86_400) + 86_400) % 86_400 / 60;
    is_hhmm_in_range(hhmm, start_hhmm, end_hhmm)
}

pub fn is_hhmm_in_range(check: i64, start: i64, end: i64) -> bool {
    if end < start {
        check >= start || check <= end
    } else {
        check >= start && check <= end
    }
}

/// C++ `DutyUtils::getDutyType` — I > R > D.
pub fn duty_type(duty: &FdpDuty) -> String {
    let mut has_i = false;
    let mut has_r = false;
    let mut has_d = false;
    for seg in &duty.segments {
        match seg.dom_int.as_str() {
            "I" => has_i = true,
            "R" => has_r = true,
            "D" => has_d = true,
            _ => {}
        }
    }
    if has_i {
        "I".into()
    } else if has_r {
        "R".into()
    } else if has_d {
        "D".into()
    } else {
        String::new()
    }
}

/// C++ `getLangdingNums` — operating legs, skip flt_sts V/R.
pub fn landing_count(duty: &FdpDuty) -> i32 {
    duty.segments
        .iter()
        .filter(|s| s.is_operating && s.flt_sts != "V" && s.flt_sts != "R")
        .count() as i32
}

/// C++ `checkDutyIsNoOperating` — true when at least one operating non-DHD/BUS exists.
pub fn has_operating_duty(duty: &FdpDuty) -> bool {
    duty.segments
        .iter()
        .any(|s| s.is_operating && s.assignment != "DHD" && s.assignment != "BUS")
}

pub fn first_fly_fleet_grp(duty: &FdpDuty) -> String {
    if !duty.fleet_grp.is_empty() {
        return duty.fleet_grp.clone();
    }
    duty.segments
        .iter()
        .find(|s| s.assignment == "FLY" || s.is_operating)
        .map(|s| {
            if s.fleet_grp.is_empty() {
                s.fleet.clone()
            } else {
                s.fleet_grp.clone()
            }
        })
        .unwrap_or_default()
}
