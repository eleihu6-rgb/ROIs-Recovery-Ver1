export declare const pbsDashboardProfileRoutes: {
  readonly current: "/dashboard/profile";
};

export type PbsDashboardUserProfile = {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  base: string | null;
  rank: string | null;
  division: string | null;
  fleet: string[] | null;
  languages: string[] | null;
  seniorityLabel: string | null;
  statusLabel: string | null;
  existingCreditLabel: string | null;
  trainingMonthLabel: string | null;
  lastLoginLabel: string | null;
};
