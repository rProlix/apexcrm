-- Module-based signup pricing and package selection.
-- Stores the server-calculated quote used to provision each new workspace.

alter table public.subscriptions
  add column if not exists monthly_price_cents integer not null default 0,
  add column if not exists billing_amount_cents integer not null default 0,
  add column if not exists selected_modules text[] not null default '{}',
  add column if not exists package_key text,
  add column if not exists pricing_version text;

alter table public.business_onboarding_responses
  add column if not exists selected_modules text[] not null default '{}',
  add column if not exists selected_package_key text,
  add column if not exists quoted_monthly_cents integer not null default 0,
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists pricing_version text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_monthly_price_nonnegative'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_monthly_price_nonnegative
      check (monthly_price_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_billing_amount_nonnegative'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_amount_nonnegative
      check (billing_amount_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_onboarding_billing_interval_check'
      and conrelid = 'public.business_onboarding_responses'::regclass
  ) then
    alter table public.business_onboarding_responses
      add constraint business_onboarding_billing_interval_check
      check (billing_interval in ('monthly', 'yearly'));
  end if;
end
$$;

create index if not exists subscriptions_package_key_idx
  on public.subscriptions (package_key);

create index if not exists business_onboarding_package_key_idx
  on public.business_onboarding_responses (selected_package_key);

comment on column public.subscriptions.monthly_price_cents is
  'Server-calculated effective monthly subscription price for the selected module set.';
comment on column public.subscriptions.billing_amount_cents is
  'Amount billed per billing interval: monthly amount or discounted annual total.';
comment on column public.subscriptions.selected_modules is
  'Canonical runtime module keys selected during signup or a later billing change.';
