export const pbsAwardRoutes = Object.freeze({
  current: "/award/current",
  periods: "/award/periods",
  periodById: (rosterPeriodId) => `/award/periods/${rosterPeriodId}`,
});

export const PBS_AWARD_COMMENT_PREFIX = "PBS_AWARD_";
export const PBS_AWARD_EXPLANATION_V1_PREFIX = "PBS_AWARD_V1|";

const PBS_AWARD_EXPLANATION_V1_PATTERN =
  /^PBS_AWARD_V1\|Matched your Tier ([1-9]|1[0-9]|2[0-4]) pairing preferences\.$/;

export const isReservedPbsAwardComment = (value) =>
  typeof value === "string" && value.startsWith(PBS_AWARD_COMMENT_PREFIX);

export const parsePbsAwardExplanationComment = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(PBS_AWARD_EXPLANATION_V1_PATTERN);

  return match
    ? `Matched your Tier ${match[1]} pairing preferences.`
    : null;
};

export const isPbsAwardExplanationComment = (value) =>
  parsePbsAwardExplanationComment(value) !== null;
