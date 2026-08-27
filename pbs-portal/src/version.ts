/**
 * PBS module display version.
 *
 * `pbs-portal` still uses this tracked display constant for its own top nav.
 * Runtime dev/build counters are also recorded in ignored `live-server/version.tmp`.
 */
export const PBS_BACKEND_VERSION = 42
export const PBS_FRONTEND_VERSION = 86

export const PBS_APP_VERSION = `Ver:B${PBS_BACKEND_VERSION}/F${PBS_FRONTEND_VERSION}`
