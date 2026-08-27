export const pbsBidFeedbackRoutes = Object.freeze({
  conflicts: "/bid-feedback/current/conflicts",
  current: "/bid-feedback/current",
  eligibility: "/bid-feedback/current/eligibility",
  eligibilityRun: "/bid-feedback/current/eligibility/run/:runId",
  eligibilityWs: "/bid-feedback/current/eligibility/ws",
});

export const pbsBidFeedbackEligibilityPairingLimit = 25;

export const pbsBidFeedbackDirections = Object.freeze({
  award: "award",
  avoid: "avoid",
  neutral: "neutral",
});
