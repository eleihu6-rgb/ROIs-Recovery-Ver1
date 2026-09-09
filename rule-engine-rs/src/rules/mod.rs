//! Shared legality rule modules used by PyO3 and batch binary adapters.

pub mod crew_scope;
pub mod rule1001;
pub mod rule7272;
pub mod rule7305;
pub mod rule7501;
pub mod rule7502;
pub mod rule7503;
pub mod rule7504;
pub mod rule7505;
pub mod rule7506;
pub mod rule7507;
pub mod rule7508;
pub mod rule7509;
pub mod rule7510;
pub mod rule8002;
pub mod rule8004;
pub mod rule8030;
pub mod rule8056;
pub mod rule8071;
pub mod rule8072;

pub const RULE_PATH_CONVERGENCE_MARKER: &str = "shared-rule-modules";
