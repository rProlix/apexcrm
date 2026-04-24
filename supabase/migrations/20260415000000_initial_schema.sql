-- ============================================================
-- ApexCRM — initial database schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Tenants ────────────────────────────────────────────────
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  subdomain     text unique,
  custom_domain text unique,
  branding      jsonb not null default '{}',
  plan_id       uuid,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tenants_slug_idx      on public.tenants (slug);
create index if not exists tenants_subdomain_idx on public.tenants (subdomain);
create index if not exists tenants_status_idx    on public.tenants (status);

-- ── Tenant domains ─────────────────────────────────────────
create table if not exists public.tenant_domains (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  hostname   text not null unique,
  verified   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tenant_domains_tenant_idx   on public.tenant_domains (tenant_id);
create index if not exists tenant_domains_hostname_idx on public.tenant_domains (hostname);

-- ── Plans ──────────────────────────────────────────────────
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  price_cents integer not null default 0,
  currency    text not null default 'usd',
  limits      jsonb not null default '{}',
  modules     jsonb not null default '[]',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Subscriptions ──────────────────────────────────────────
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  plan_id                uuid not null references public.plans (id),
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'trial',
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id);

-- ── Users (CRM profiles, separate from auth.users) ─────────
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  auth_user_id uuid unique,
  email        text not null,
  role         text not null default 'member',
  status       text not null default 'active',
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists users_tenant_idx      on public.users (tenant_id);
create index if not exists users_auth_user_idx   on public.users (auth_user_id);
create index if not exists users_email_idx       on public.users (email);

-- ── Tenant modules ─────────────────────────────────────────
create table if not exists public.tenant_modules (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  enabled    boolean not null default true,
  config     jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_key)
);

create index if not exists tenant_modules_tenant_idx on public.tenant_modules (tenant_id);

-- ── Customers ──────────────────────────────────────────────
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_tenant_idx on public.customers (tenant_id);
create index if not exists customers_email_idx  on public.customers (email);

-- ── Customer accounts (portal login) ───────────────────────
create table if not exists public.customer_accounts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  auth_user_id uuid unique,
  email        text not null,
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists customer_accounts_tenant_idx on public.customer_accounts (tenant_id);

-- ── Leads ──────────────────────────────────────────────────
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  source     text,
  status     text not null default 'new',
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_tenant_idx on public.leads (tenant_id);
create index if not exists leads_status_idx on public.leads (status);

-- ── Contacts ───────────────────────────────────────────────
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  type       text not null default 'contact',
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_tenant_idx on public.contacts (tenant_id);

-- ── Vehicles ───────────────────────────────────────────────
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null,
  plate_number text,
  vin          text,
  status       text not null default 'active',
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vehicles_tenant_idx on public.vehicles (tenant_id);

-- ── Appointments ───────────────────────────────────────────
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete set null,
  contact_id   uuid references public.contacts  (id) on delete set null,
  service_name text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'scheduled',
  notes        text,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists appointments_tenant_idx    on public.appointments (tenant_id);
create index if not exists appointments_starts_at_idx on public.appointments (starts_at);
create index if not exists appointments_status_idx    on public.appointments (status);

-- ── Payments ───────────────────────────────────────────────
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  customer_id        uuid references public.customers (id) on delete set null,
  contact_id         uuid references public.contacts  (id) on delete set null,
  amount_cents       integer not null,
  currency           text not null default 'usd',
  provider           text not null,
  provider_reference text,
  status             text not null default 'pending',
  metadata           jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists payments_tenant_idx on public.payments (tenant_id);
create index if not exists payments_status_idx on public.payments (status);

-- ── Reward points ──────────────────────────────────────────
create table if not exists public.reward_points (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants  (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  balance     integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create index if not exists reward_points_tenant_idx on public.reward_points (tenant_id);

-- ── Reward history ─────────────────────────────────────────
create table if not exists public.reward_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants  (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists reward_history_tenant_idx on public.reward_history (tenant_id, customer_id);

-- ── Damage assessments ─────────────────────────────────────
create table if not exists public.damage_assessments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants  (id) on delete cascade,
  vehicle_id    uuid not null references public.vehicles  (id) on delete cascade,
  customer_id   uuid references public.customers (id) on delete set null,
  score         numeric,
  ai_confidence numeric,
  result        jsonb not null default '{}',
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists damage_assessments_tenant_idx on public.damage_assessments (tenant_id);

-- ── Activity logs ──────────────────────────────────────────
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_type  text not null,
  actor_id    uuid,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_tenant_idx on public.activity_logs (tenant_id);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);

-- ── Audit logs ─────────────────────────────────────────────
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants (id) on delete cascade,
  actor_user_id uuid,
  action        text not null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_tenant_idx on public.audit_logs (tenant_id);

-- ── Dashboard layouts ──────────────────────────────────────
create table if not exists public.dashboard_layouts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  layout     jsonb not null default '{"sections":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

-- ── RPC helper: set tenant context for RLS ─────────────────
create or replace function public.set_tenant_context(p_tenant_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);
end;
$$;

-- ── Row-Level Security ─────────────────────────────────────
-- Service-role bypasses all RLS, so these are intentionally
-- permissive — tighten per-table as needed in production.

alter table public.tenants          enable row level security;
alter table public.tenant_domains   enable row level security;
alter table public.tenant_modules   enable row level security;
alter table public.plans            enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.users            enable row level security;
alter table public.customers        enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.leads            enable row level security;
alter table public.contacts         enable row level security;
alter table public.vehicles         enable row level security;
alter table public.appointments     enable row level security;
alter table public.payments         enable row level security;
alter table public.reward_points    enable row level security;
alter table public.reward_history   enable row level security;
alter table public.damage_assessments enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.dashboard_layouts enable row level security;

-- Allow service-role full access (bypasses RLS anyway, but explicit is clearer)
-- All app queries use the service-role key, so these policies cover dev usage.
-- In production, add per-table policies scoped to auth.uid() / tenant context.

create policy "service_role_all" on public.tenants          for all using (true) with check (true);
create policy "service_role_all" on public.tenant_domains   for all using (true) with check (true);
create policy "service_role_all" on public.tenant_modules   for all using (true) with check (true);
create policy "service_role_all" on public.plans            for all using (true) with check (true);
create policy "service_role_all" on public.subscriptions    for all using (true) with check (true);
create policy "service_role_all" on public.users            for all using (true) with check (true);
create policy "service_role_all" on public.customers        for all using (true) with check (true);
create policy "service_role_all" on public.customer_accounts for all using (true) with check (true);
create policy "service_role_all" on public.leads            for all using (true) with check (true);
create policy "service_role_all" on public.contacts         for all using (true) with check (true);
create policy "service_role_all" on public.vehicles         for all using (true) with check (true);
create policy "service_role_all" on public.appointments     for all using (true) with check (true);
create policy "service_role_all" on public.payments         for all using (true) with check (true);
create policy "service_role_all" on public.reward_points    for all using (true) with check (true);
create policy "service_role_all" on public.reward_history   for all using (true) with check (true);
create policy "service_role_all" on public.damage_assessments for all using (true) with check (true);
create policy "service_role_all" on public.activity_logs    for all using (true) with check (true);
create policy "service_role_all" on public.audit_logs       for all using (true) with check (true);
create policy "service_role_all" on public.dashboard_layouts for all using (true) with check (true);
