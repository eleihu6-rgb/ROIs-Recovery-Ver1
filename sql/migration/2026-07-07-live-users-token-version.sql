-- ============================================================
-- Live users JWT session revocation version
-- Date: 2026-07-07
-- Purpose:
--   Add users.token_version so logout and other security events can revoke
--   previously issued JWTs without storing per-token server state.
-- ============================================================

alter table users
    add column if not exists token_version integer not null default 0;

comment on column users.token_version
    is 'JWT 会话撤销版本号；logout / 密码重置等安全事件递增后，旧 token 立即失效';
