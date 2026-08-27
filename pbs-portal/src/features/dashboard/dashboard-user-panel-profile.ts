import type { PbsDashboardBidPackage } from "../../../../packages/contracts/pbs-dashboard-summary.js";
import type { PbsDashboardUserProfile } from "../../../../packages/contracts/pbs-dashboard-profile.js";
import type { DashboardUserPanelData } from "@/features/dashboard/types";
import { DASHBOARD_EMPTY_VALUE } from "@/features/dashboard/dashboard-view-model";
import type { AuthenticatedUser } from "@/shared/types/auth";

type BuildDashboardUserPanelDataOptions = {
  bidPackage?: PbsDashboardBidPackage | null;
  profile?: PbsDashboardUserProfile | null;
  sessionUser?: AuthenticatedUser | null;
};

const normalizeValue = (value?: string | null) => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : DASHBOARD_EMPTY_VALUE;
};

const formatCoarseRemainingLabel = (value?: string | null): string => {
  const normalized = normalizeValue(value);

  if (!/\bMINS?\b/i.test(normalized)) {
    return normalized;
  }

  const withoutMinutes = normalized.replace(/\s*\b\d+\s+MINS?\b\s*$/i, "").trim();

  if (withoutMinutes === normalized) {
    return normalized;
  }

  const coarseLabel = withoutMinutes
    .replace(/^0\s+DAYS?\s*/i, "")
    .replace(/\b0\s+HRS?\b/i, "")
    .trim();

  return coarseLabel.length > 0 ? coarseLabel : "LESS THAN 1 HR";
};

const formatList = (values?: string[] | null) => {
  const normalizedValues = values
    ?.map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [];

  return normalizedValues.length > 0
    ? normalizedValues.join("\n")
    : DASHBOARD_EMPTY_VALUE;
};

export const buildDashboardUserPanelData = ({
  bidPackage,
  profile,
  sessionUser,
}: BuildDashboardUserPanelDataOptions): DashboardUserPanelData => {
  const name = normalizeValue(profile?.name ?? sessionUser?.name);

  return {
    name,
    email: normalizeValue(profile?.email),
    bidInfoTitle: "BID INFORMATION-LOCAL TIME",
    bidInfoRows: [
      { label: "BID START", value: normalizeValue(bidPackage?.bidStartLabel) },
      { label: "BID END", value: normalizeValue(bidPackage?.bidCloseLabel) },
      { label: "REMAINING", value: formatCoarseRemainingLabel(bidPackage?.remainingLabel), highlight: true },
    ],
    userInfoTitle: "USER INFORMATION",
    userInfoGrid: {
      headers: [
        ["BASE", "FLEET", "POSITION"],
        ["SENIORITY", "LANGUAGE", "EXISTING CREDIT"],
        ["TRAINING MONTH", "LAST LOGIN", ""],
      ],
      values: [
        [
          normalizeValue(profile?.base),
          formatList(profile?.fleet),
          normalizeValue(profile?.rank),
        ],
        [
          normalizeValue(profile?.seniorityLabel),
          formatList(profile?.languages),
          normalizeValue(profile?.existingCreditLabel),
        ],
        [
          normalizeValue(profile?.trainingMonthLabel),
          normalizeValue(profile?.lastLoginLabel),
          "",
        ],
      ],
    },
  };
};
