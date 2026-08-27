export type SourceUserRow = {
  user_code: string;
  user_name: string;
  password_hash: string;
  branch_code: string;
  py_abbr: string;
  gender: string | null;
  tel: string | null;
  eff_dt: string;
  exp_dt: string | null;
  ad_active: number;
  email: string | null;
  status: number;
  is_admin: number;
  password_access: string | null;
  portal_access: string | null;
  app_access: string | null;
  is_first_login: string | null;
  interface_user_id: string | null;
  [key: string]: string | number | null;
};

export const DEDICATED_PBS_ADMIN_USER_CODE = "admin";

export const isDedicatedPbsAdminUserCode = (userCode: string | null | undefined) =>
  userCode?.trim().toLowerCase() === DEDICATED_PBS_ADMIN_USER_CODE;

export const PBS_USER_ALIGNED_FIELDS = [
  "user_code",
  "user_name",
  "password_hash",
  "branch_code",
  "py_abbr",
  "gender",
  "tel",
  "eff_dt",
  "exp_dt",
  "ad_active",
  "email",
  "status",
  "is_admin",
  "password_access",
  "portal_access",
  "app_access",
  "is_first_login",
  "interface_user_id",
] as const;

export const PBS_USER_SECURITY_FIELDS = [
  "crew_id",
  "last_login_at",
  "last_login_ip",
  "failed_login_count",
  "locked_until",
  "password_changed_at",
  "token_version",
] as const;

export type MappedPbsUser = {
  crewId: string;
  userCode: string;
  userName: string;
  passwordHash: string;
  branchCode: string;
  pyAbbr: string;
  gender: string | null;
  tel: string | null;
  effDt: string;
  expDt: string | null;
  adActive: number;
  email: string | null;
  status: number;
  isAdmin: number;
  passwordAccess: string | null;
  portalAccess: string | null;
  appAccess: string | null;
  isFirstLogin: string | null;
  interfaceUserId: string | null;
};

export const buildSelectedColumns = (crewIdField: string) => {
  return Array.from(new Set([
    ...PBS_USER_ALIGNED_FIELDS,
    crewIdField,
  ]));
};

export const mapSourceUserToPbsUser = (
  row: SourceUserRow,
  crewIdField: string,
): MappedPbsUser | null => {
  const userCode = String(row.user_code).trim();
  const crewIdValue = row[crewIdField];

  if (!crewIdValue) {
    return null;
  }

  const crewId = String(crewIdValue).trim();

  if (!userCode || !crewId) {
    return null;
  }

  return {
    crewId,
    userCode,
    userName: row.user_name,
    passwordHash: row.password_hash,
    branchCode: row.branch_code,
    pyAbbr: row.py_abbr,
    gender: row.gender,
    tel: row.tel,
    effDt: row.eff_dt,
    expDt: row.exp_dt,
    adActive: row.ad_active,
    email: row.email,
    status: row.status,
    isAdmin: row.is_admin,
    passwordAccess: row.password_access,
    portalAccess: row.portal_access,
    appAccess: row.app_access,
    isFirstLogin: row.is_first_login,
    interfaceUserId: row.interface_user_id,
  };
};
