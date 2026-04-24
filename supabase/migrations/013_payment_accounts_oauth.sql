-- supabase/migrations/013_payment_accounts_oauth.sql
-- Extend payment_accounts to support OAuth tokens for Stripe Connect and Square OAuth

-- Add OAuth columns (idempotent)
alter table payment_accounts
  add column if not exists access_token   text,
  add column if not exists refresh_token  text,
  add column if not exists scope          text,
  add column if not exists expires_at     timestamptz,
  add column if not exists token_type     text default 'bearer',
  add column if not exists connection_method text default 'api_key'; -- 'oauth' | 'api_key'

-- Add oauth_state table for CSRF validation (short-lived, cleaned up after use)
create table if not exists payment_oauth_states (
  id         uuid primary key default gen_random_uuid(),
  state      text not null unique,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  provider   text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used       boolean not null default false
);

create index if not exists idx_oauth_states_state     on payment_oauth_states(state);
create index if not exists idx_oauth_states_tenant    on payment_oauth_states(tenant_id);
create index if not exists idx_oauth_states_expires   on payment_oauth_states(expires_at);

-- RLS on oauth_states
alter table payment_oauth_states enable row level security;

create policy "service_role_oauth_states" on payment_oauth_states
  for all to service_role using (true) with check (true);

-- Function to clean up expired states automatically
create or replace function cleanup_expired_oauth_states()
returns void language plpgsql as $$
begin
  delete from payment_oauth_states where expires_at < now();
end;
$$;

-- Comment explaining token security
comment on column payment_accounts.access_token  is 'Encrypted OAuth access token — never expose to frontend';
comment on column payment_accounts.refresh_token is 'Encrypted OAuth refresh token — never expose to frontend';
