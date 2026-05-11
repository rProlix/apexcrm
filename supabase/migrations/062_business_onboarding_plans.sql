-- ============================================================
-- 062 — Business Onboarding + Plans + Module Locking
-- Extends existing plans/subscriptions/tenant_modules tables.
-- Creates business_onboarding_responses table.
-- Seeds default plan rows.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── 1. Extend public.plans ────────────────────────────────────
alter table public.plans
  add column if not exists description                   text,
  add column if not exists is_custom                     boolean not null default false,
  add column if not exists is_active                     boolean not null default true,
  add column if not exists sort_order                    integer not null default 0,
  add column if not exists max_staff                     integer,
  add column if not exists max_customers                 integer,
  add column if not exists max_products                  integer,
  add column if not exists max_appointments_per_month    integer,
  add column if not exists max_ai_generations_per_month  integer,
  add column if not exists max_360_packages              integer,
  add column if not exists price_yearly_cents            integer,
  add column if not exists includes_custom_domain        boolean not null default false,
  add column if not exists includes_white_label_email    boolean not null default false,
  add column if not exists includes_ai_builder           boolean not null default false,
  add column if not exists includes_advanced_analytics   boolean not null default false,
  add column if not exists metadata                      jsonb not null default '{}'::jsonb;

-- Sync status→is_active if needed (status was the old field)
update public.plans set is_active = (status = 'active') where is_active = true and status is not null;

-- ── 2. Extend public.subscriptions ───────────────────────────
alter table public.subscriptions
  add column if not exists plan_key               text not null default 'starter',
  add column if not exists billing_interval       text not null default 'monthly',
  add column if not exists trial_ends_at          timestamptz,
  add column if not exists current_period_start   timestamptz,
  add column if not exists provider               text,
  add column if not exists metadata               jsonb not null default '{}'::jsonb;

-- Backfill plan_key from joined plans table for existing rows
update public.subscriptions s
set    plan_key = coalesce(p.slug, 'starter')
from   public.plans p
where  s.plan_id = p.id
  and  (s.plan_key = 'starter' or s.plan_key is null);

-- ── 3. Extend public.tenant_modules ──────────────────────────
alter table public.tenant_modules
  add column if not exists is_locked      boolean not null default false,
  add column if not exists locked_reason  text,
  add column if not exists source         text not null default 'plan';

-- ── 4. Create business_onboarding_responses ──────────────────
create table if not exists public.business_onboarding_responses (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid references public.tenants(id) on delete cascade,
  auth_user_id                   uuid references auth.users(id) on delete set null,
  business_name                  text,
  business_type                  text,
  business_category              text,
  business_description           text,
  sells_products                 boolean,
  sells_services                 boolean,
  needs_appointments             boolean,
  needs_payments                 boolean,
  needs_website                  boolean,
  needs_store                    boolean,
  needs_rewards                  boolean,
  needs_staff_management         boolean,
  needs_customer_portal          boolean,
  needs_ai_builder               boolean,
  needs_ai_images                boolean,
  needs_360_products             boolean,
  needs_marketing_emails         boolean,
  needs_analytics                boolean,
  employee_count                 integer,
  expected_monthly_customers     integer,
  expected_monthly_appointments  integer,
  expected_monthly_orders        integer,
  monthly_budget_cents           integer,
  existing_website_url           text,
  desired_subdomain              text,
  selected_plan_key              text,
  recommended_plan_key           text,
  recommended_modules            text[] not null default '{}',
  locked_modules                 text[] not null default '{}',
  answers                        jsonb not null default '{}'::jsonb,
  recommendation_reason          text,
  completed_at                   timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists bor_tenant_idx       on public.business_onboarding_responses (tenant_id);
create index if not exists bor_auth_user_idx    on public.business_onboarding_responses (auth_user_id);
create index if not exists bor_plan_key_idx     on public.business_onboarding_responses (selected_plan_key);

-- ── 5. Seed default plans ─────────────────────────────────────

-- Starter ($29/mo)
insert into public.plans (
  name, slug, description, price_cents, price_yearly_cents,
  is_custom, is_active, sort_order,
  max_staff, max_customers, max_products, max_appointments_per_month,
  max_ai_generations_per_month, max_360_packages,
  includes_custom_domain, includes_white_label_email,
  includes_ai_builder, includes_advanced_analytics,
  modules, limits, status
) values (
  'Starter', 'starter',
  'Best for small service businesses getting started. Includes appointments, customer management, and a basic website.',
  2900, 27900,
  false, true, 1,
  3, 200, 50, 100,
  0, 0,
  false, false, false, false,
  '["customers","appointments","contacts","leads","website"]'::jsonb,
  '{"max_staff":3,"max_customers":200,"max_products":50}'::jsonb,
  'active'
)
on conflict (slug) do update set
  name                          = excluded.name,
  description                   = excluded.description,
  price_cents                   = excluded.price_cents,
  price_yearly_cents            = excluded.price_yearly_cents,
  is_active                     = excluded.is_active,
  sort_order                    = excluded.sort_order,
  max_staff                     = excluded.max_staff,
  max_customers                 = excluded.max_customers,
  max_products                  = excluded.max_products,
  max_appointments_per_month    = excluded.max_appointments_per_month,
  max_ai_generations_per_month  = excluded.max_ai_generations_per_month,
  max_360_packages              = excluded.max_360_packages,
  includes_custom_domain        = excluded.includes_custom_domain,
  includes_white_label_email    = excluded.includes_white_label_email,
  includes_ai_builder           = excluded.includes_ai_builder,
  includes_advanced_analytics   = excluded.includes_advanced_analytics,
  modules                       = excluded.modules,
  limits                        = excluded.limits,
  updated_at                    = now();

-- Growth ($79/mo)
insert into public.plans (
  name, slug, description, price_cents, price_yearly_cents,
  is_custom, is_active, sort_order,
  max_staff, max_customers, max_products, max_appointments_per_month,
  max_ai_generations_per_month, max_360_packages,
  includes_custom_domain, includes_white_label_email,
  includes_ai_builder, includes_advanced_analytics,
  modules, limits, status
) values (
  'Growth', 'growth',
  'Best for businesses that need online payments, a website, and customer retention. Includes loyalty rewards and store.',
  7900, 75900,
  false, true, 2,
  10, 1000, 200, 500,
  0, 0,
  false, false, false, false,
  '["customers","appointments","contacts","leads","website","payments","rewards","store","messages"]'::jsonb,
  '{"max_staff":10,"max_customers":1000,"max_products":200}'::jsonb,
  'active'
)
on conflict (slug) do update set
  name                          = excluded.name,
  description                   = excluded.description,
  price_cents                   = excluded.price_cents,
  price_yearly_cents            = excluded.price_yearly_cents,
  is_active                     = excluded.is_active,
  sort_order                    = excluded.sort_order,
  max_staff                     = excluded.max_staff,
  max_customers                 = excluded.max_customers,
  max_products                  = excluded.max_products,
  max_appointments_per_month    = excluded.max_appointments_per_month,
  max_ai_generations_per_month  = excluded.max_ai_generations_per_month,
  max_360_packages              = excluded.max_360_packages,
  includes_custom_domain        = excluded.includes_custom_domain,
  includes_white_label_email    = excluded.includes_white_label_email,
  includes_ai_builder           = excluded.includes_ai_builder,
  includes_advanced_analytics   = excluded.includes_advanced_analytics,
  modules                       = excluded.modules,
  limits                        = excluded.limits,
  updated_at                    = now();

-- Pro ($149/mo)
insert into public.plans (
  name, slug, description, price_cents, price_yearly_cents,
  is_custom, is_active, sort_order,
  max_staff, max_customers, max_products, max_appointments_per_month,
  max_ai_generations_per_month, max_360_packages,
  includes_custom_domain, includes_white_label_email,
  includes_ai_builder, includes_advanced_analytics,
  modules, limits, status
) values (
  'Pro', 'pro',
  'Best for scaling businesses that want advanced automation, AI tools, and 360 product studio.',
  14900, 143900,
  false, true, 3,
  50, null, null, null,
  100, 20,
  true, true, true, true,
  '["customers","appointments","contacts","leads","website","payments","rewards","store","messages","product_360","damage_ai","vehicles"]'::jsonb,
  '{"max_staff":50,"max_ai_generations":100,"max_360_packages":20}'::jsonb,
  'active'
)
on conflict (slug) do update set
  name                          = excluded.name,
  description                   = excluded.description,
  price_cents                   = excluded.price_cents,
  price_yearly_cents            = excluded.price_yearly_cents,
  is_active                     = excluded.is_active,
  sort_order                    = excluded.sort_order,
  max_staff                     = excluded.max_staff,
  max_customers                 = excluded.max_customers,
  max_products                  = excluded.max_products,
  max_appointments_per_month    = excluded.max_appointments_per_month,
  max_ai_generations_per_month  = excluded.max_ai_generations_per_month,
  max_360_packages              = excluded.max_360_packages,
  includes_custom_domain        = excluded.includes_custom_domain,
  includes_white_label_email    = excluded.includes_white_label_email,
  includes_ai_builder           = excluded.includes_ai_builder,
  includes_advanced_analytics   = excluded.includes_advanced_analytics,
  modules                       = excluded.modules,
  limits                        = excluded.limits,
  updated_at                    = now();

-- Enterprise (custom pricing)
insert into public.plans (
  name, slug, description, price_cents, price_yearly_cents,
  is_custom, is_active, sort_order,
  max_staff, max_customers, max_products, max_appointments_per_month,
  max_ai_generations_per_month, max_360_packages,
  includes_custom_domain, includes_white_label_email,
  includes_ai_builder, includes_advanced_analytics,
  modules, limits, status
) values (
  'Enterprise', 'enterprise',
  'Best for multi-location businesses or custom workflows. All modules included with custom limits, priority support, and custom integrations.',
  0, 0,
  true, true, 4,
  null, null, null, null,
  null, null,
  true, true, true, true,
  '["customers","appointments","contacts","leads","website","payments","rewards","store","messages","product_360","damage_ai","vehicles"]'::jsonb,
  '{}'::jsonb,
  'active'
)
on conflict (slug) do update set
  name                          = excluded.name,
  description                   = excluded.description,
  is_custom                     = excluded.is_custom,
  is_active                     = excluded.is_active,
  sort_order                    = excluded.sort_order,
  max_staff                     = excluded.max_staff,
  max_customers                 = excluded.max_customers,
  max_products                  = excluded.max_products,
  max_appointments_per_month    = excluded.max_appointments_per_month,
  max_ai_generations_per_month  = excluded.max_ai_generations_per_month,
  max_360_packages              = excluded.max_360_packages,
  includes_custom_domain        = excluded.includes_custom_domain,
  includes_white_label_email    = excluded.includes_white_label_email,
  includes_ai_builder           = excluded.includes_ai_builder,
  includes_advanced_analytics   = excluded.includes_advanced_analytics,
  modules                       = excluded.modules,
  limits                        = excluded.limits,
  updated_at                    = now();

-- ── 6. RLS on business_onboarding_responses ───────────────────
alter table public.business_onboarding_responses enable row level security;

-- Service role has full access
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'business_onboarding_responses'
      and policyname = 'service_role_all_bor'
  ) then
    create policy "service_role_all_bor"
      on public.business_onboarding_responses
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- Tenant admins can read/update their own onboarding response
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'business_onboarding_responses'
      and policyname = 'tenant_admin_read_own_bor'
  ) then
    create policy "tenant_admin_read_own_bor"
      on public.business_onboarding_responses
      for select
      to authenticated
      using (
        tenant_id in (
          select tenant_id from public.users
          where auth_user_id = auth.uid()
            and role in ('admin', 'owner')
            and status = 'active'
        )
        or auth_user_id = auth.uid()
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'business_onboarding_responses'
      and policyname = 'tenant_admin_upsert_own_bor'
  ) then
    create policy "tenant_admin_upsert_own_bor"
      on public.business_onboarding_responses
      for all
      to authenticated
      using (
        tenant_id in (
          select tenant_id from public.users
          where auth_user_id = auth.uid()
            and role in ('admin', 'owner')
            and status = 'active'
        )
        or (tenant_id is null and auth_user_id = auth.uid())
      )
      with check (
        tenant_id in (
          select tenant_id from public.users
          where auth_user_id = auth.uid()
            and role in ('admin', 'owner')
            and status = 'active'
        )
        or (tenant_id is null and auth_user_id = auth.uid())
      );
  end if;
end $$;

-- ── 7. Update tenant_modules RLS to expose is_locked ─────────
-- The existing RLS on tenant_modules already covers select/update for admins.
-- No change needed — is_locked is in the same table.

-- ── 8. Utility: updated_at trigger for new table ─────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bor_updated_at'
  ) then
    create trigger bor_updated_at
      before update on public.business_onboarding_responses
      for each row execute function public.set_updated_at();
  end if;
end $$;
