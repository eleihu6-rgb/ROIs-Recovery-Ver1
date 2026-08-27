/**
 * Build-time environment, injected by deploy/<env>/env/*.build.env as
 * VITE_APP_ENV (UAT / SIT). Local dev servers leave it unset → DEV.
 * Drives the env badge in the top nav. Visibility of nav tabs is gated
 * purely by `canAccessModule` (system_menu permissions), not by env.
 */
export const APP_ENV: string = import.meta.env.VITE_APP_ENV ?? 'DEV'
