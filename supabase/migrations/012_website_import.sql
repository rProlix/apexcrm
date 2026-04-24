-- supabase/migrations/012_website_import.sql
-- Website Import / Scraper feature
-- Adds tables to support the owner-only website bootstrapper pipeline.

-- ─── website_import_jobs ──────────────────────────────────────────────────────
create table if not exists website_import_jobs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null,
  created_by      uuid        not null,
  status          text        not null default 'queued',
    -- queued | running | completed | failed | canceled
  source_urls     jsonb       not null default '[]',
  notes           text,
  target_site_id  uuid,
  target_page_id  uuid,
  error_message   text,
  progress        numeric     not null default 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint website_import_jobs_status_check
    check (status in ('queued','running','completed','failed','canceled')),
  constraint website_import_jobs_progress_check
    check (progress >= 0 and progress <= 100)
);

create index if not exists website_import_jobs_tenant_idx
  on website_import_jobs (tenant_id);

create index if not exists website_import_jobs_status_idx
  on website_import_jobs (status);

create index if not exists website_import_jobs_created_by_idx
  on website_import_jobs (created_by);

-- ─── website_import_sources ───────────────────────────────────────────────────
create table if not exists website_import_sources (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  job_id           uuid        not null references website_import_jobs(id) on delete cascade,
  source_url       text        not null,
  source_type      text        default 'website',
    -- website | yelp | business_profile | manual
  page_title       text,
  fetched_status   text        not null default 'pending',
    -- pending | fetched | failed
  confidence_score numeric     not null default 0,
  raw_metadata     jsonb,
  raw_text         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint website_import_sources_type_check
    check (source_type in ('website','yelp','business_profile','manual')),
  constraint website_import_sources_status_check
    check (fetched_status in ('pending','fetched','failed'))
);

create index if not exists website_import_sources_tenant_idx
  on website_import_sources (tenant_id);

create index if not exists website_import_sources_job_idx
  on website_import_sources (job_id);

create index if not exists website_import_sources_url_idx
  on website_import_sources (source_url);

-- ─── website_import_results ───────────────────────────────────────────────────
create table if not exists website_import_results (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  job_id           uuid        not null references website_import_jobs(id) on delete cascade,
  result_key       text        not null,
  source_key       text,
  mapped_section   text,
  result_value     jsonb       not null default '{}',
  confidence_score numeric     not null default 0,
  approved         boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists website_import_results_tenant_idx
  on website_import_results (tenant_id);

create index if not exists website_import_results_job_idx
  on website_import_results (job_id);

create index if not exists website_import_results_key_idx
  on website_import_results (result_key);

-- ─── website_import_media ─────────────────────────────────────────────────────
create table if not exists website_import_media (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null,
  job_id      uuid        not null references website_import_jobs(id) on delete cascade,
  source_url  text        not null,
  asset_url   text        not null,
  asset_type  text,
    -- logo | favicon | hero | gallery | product | other
  alt_text    text,
  width       integer,
  height      integer,
  file_size   integer,
  created_at  timestamptz not null default now()
);

create index if not exists website_import_media_tenant_idx
  on website_import_media (tenant_id);

create index if not exists website_import_media_job_idx
  on website_import_media (job_id);

-- ─── website_import_audit ─────────────────────────────────────────────────────
create table if not exists website_import_audit (
  id        uuid        primary key default gen_random_uuid(),
  tenant_id uuid        not null,
  job_id    uuid        not null references website_import_jobs(id) on delete cascade,
  action    text        not null,
  metadata  jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_import_audit_tenant_idx
  on website_import_audit (tenant_id);

create index if not exists website_import_audit_job_idx
  on website_import_audit (job_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function set_website_import_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger website_import_jobs_updated_at
  before update on website_import_jobs
  for each row execute function set_website_import_updated_at();

create trigger website_import_sources_updated_at
  before update on website_import_sources
  for each row execute function set_website_import_updated_at();

create trigger website_import_results_updated_at
  before update on website_import_results
  for each row execute function set_website_import_updated_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table website_import_jobs     enable row level security;
alter table website_import_sources  enable row level security;
alter table website_import_results  enable row level security;
alter table website_import_media    enable row level security;
alter table website_import_audit    enable row level security;

-- Helper: resolve the calling user's row from public.users
-- Returns NULL if not authenticated, so all policies fail gracefully.

-- ── website_import_jobs policies ─────────────────────────────────────────────

-- Owner: full access to all tenants
create policy "import_jobs_owner_all"
  on website_import_jobs
  for all
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'owner'
        and u.status = 'active'
    )
  );

-- Admin: own tenant only, no insert/delete
create policy "import_jobs_admin_select"
  on website_import_jobs
  for select
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'admin'
        and u.status = 'active'
        and u.tenant_id = website_import_jobs.tenant_id
    )
  );

-- Deny customers entirely (no policy matches = denied)

-- ── website_import_sources policies ──────────────────────────────────────────

create policy "import_sources_owner_all"
  on website_import_sources
  for all
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'owner'
        and u.status = 'active'
    )
  );

create policy "import_sources_admin_select"
  on website_import_sources
  for select
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'admin'
        and u.status = 'active'
        and u.tenant_id = website_import_sources.tenant_id
    )
  );

-- ── website_import_results policies ──────────────────────────────────────────

create policy "import_results_owner_all"
  on website_import_results
  for all
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'owner'
        and u.status = 'active'
    )
  );

create policy "import_results_admin_select"
  on website_import_results
  for select
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'admin'
        and u.status = 'active'
        and u.tenant_id = website_import_results.tenant_id
    )
  );

-- ── website_import_media policies ────────────────────────────────────────────

create policy "import_media_owner_all"
  on website_import_media
  for all
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'owner'
        and u.status = 'active'
    )
  );

create policy "import_media_admin_select"
  on website_import_media
  for select
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'admin'
        and u.status = 'active'
        and u.tenant_id = website_import_media.tenant_id
    )
  );

-- ── website_import_audit policies ────────────────────────────────────────────

create policy "import_audit_owner_all"
  on website_import_audit
  for all
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'owner'
        and u.status = 'active'
    )
  );

create policy "import_audit_admin_select"
  on website_import_audit
  for select
  using (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role = 'admin'
        and u.status = 'active'
        and u.tenant_id = website_import_audit.tenant_id
    )
  );
