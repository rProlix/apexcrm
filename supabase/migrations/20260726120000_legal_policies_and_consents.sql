-- Versioned legal acceptance evidence for business and customer signups.
-- Consent rows are append-only through application roles.

CREATE TABLE IF NOT EXISTS public.legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  subject_email text NOT NULL,
  account_type text NOT NULL
    CHECK (account_type IN ('business_admin', 'business_user', 'customer')),
  document_key text NOT NULL
    CHECK (document_key IN (
      'terms',
      'privacy',
      'acceptable-use',
      'ai-notice',
      'data-processing-addendum',
      'cookie-policy'
    )),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  ip_address text,
  user_agent text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT legal_consents_email_not_blank
    CHECK (char_length(trim(subject_email)) > 3),
  CONSTRAINT legal_consents_version_not_blank
    CHECK (char_length(trim(document_version)) > 0),
  CONSTRAINT legal_consents_source_not_blank
    CHECK (char_length(trim(source)) > 0),
  CONSTRAINT legal_consents_user_agent_length
    CHECK (user_agent IS NULL OR char_length(user_agent) <= 1024),
  CONSTRAINT legal_consents_unique_acceptance
    UNIQUE (auth_user_id, account_type, document_key, document_version, source)
);

CREATE INDEX IF NOT EXISTS legal_consents_auth_user_idx
  ON public.legal_consents (auth_user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS legal_consents_tenant_idx
  ON public.legal_consents (tenant_id, accepted_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_consents_document_idx
  ON public.legal_consents (document_key, document_version, accepted_at DESC);
CREATE INDEX IF NOT EXISTS legal_consents_email_idx
  ON public.legal_consents (lower(subject_email), accepted_at DESC);

ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_owner_read_legal_consents
  ON public.legal_consents;
CREATE POLICY platform_owner_read_legal_consents
  ON public.legal_consents
  FOR SELECT TO authenticated
  USING (public.is_platform_owner());

DROP POLICY IF EXISTS subject_read_own_legal_consents
  ON public.legal_consents;
CREATE POLICY subject_read_own_legal_consents
  ON public.legal_consents
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

GRANT SELECT ON public.legal_consents TO authenticated;
GRANT SELECT, INSERT ON public.legal_consents TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.legal_consents FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.legal_consents FROM service_role;

COMMENT ON TABLE public.legal_consents IS
  'Append-only evidence of the exact legal document versions affirmatively accepted or acknowledged during account creation.';
