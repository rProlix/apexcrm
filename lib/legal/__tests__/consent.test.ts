import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createLegalAgreement,
  getRequiredLegalDocuments,
  validateLegalAgreement,
} from '@/lib/legal/consent'
import {
  LEGAL_DOCUMENT_ORDER,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION,
} from '@/lib/legal/policies'

test('the current agreement carries the exact version of every legal document', () => {
  const acceptedAt = new Date('2026-07-26T12:00:00.000Z')
  const agreement = createLegalAgreement(acceptedAt)

  assert.equal(agreement.accepted, true)
  assert.equal(agreement.acceptedAt, acceptedAt.toISOString())
  assert.equal(agreement.termsVersion, LEGAL_DOCUMENTS.terms.version)
  assert.equal(agreement.privacyVersion, LEGAL_DOCUMENTS.privacy.version)
  assert.equal(agreement.acceptableUseVersion, LEGAL_DOCUMENTS['acceptable-use'].version)
  assert.equal(agreement.aiNoticeVersion, LEGAL_DOCUMENTS['ai-notice'].version)
  assert.equal(
    agreement.dataProcessingAddendumVersion,
    LEGAL_DOCUMENTS['data-processing-addendum'].version,
  )
  assert.equal(agreement.cookiePolicyVersion, LEGAL_DOCUMENTS['cookie-policy'].version)
})

test('legal agreement validation rejects missing acceptance and stale versions', () => {
  const now = new Date('2026-07-26T12:00:00.000Z')

  assert.equal(validateLegalAgreement(null, 'customer', now).ok, false)
  assert.equal(
    validateLegalAgreement(
      { ...createLegalAgreement(now), accepted: false },
      'customer',
      now,
    ).ok,
    false,
  )
  assert.equal(
    validateLegalAgreement(
      { ...createLegalAgreement(now), termsVersion: 'old-version' },
      'business_admin',
      now,
    ).ok,
    false,
  )
})

test('legal agreement validation accepts current versions and recent evidence', () => {
  const now = new Date('2026-07-26T12:00:00.000Z')
  const result = validateLegalAgreement(
    createLegalAgreement(new Date('2026-07-26T11:59:30.000Z')),
    'business_admin',
    now,
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.agreement.termsVersion, LEGAL_VERSION)
  }
})

test('business consent includes the DPA while customer consent does not', () => {
  assert.deepEqual(
    getRequiredLegalDocuments('customer'),
    ['terms', 'privacy', 'acceptable-use', 'ai-notice', 'cookie-policy'],
  )
  assert.deepEqual(
    getRequiredLegalDocuments('business_admin'),
    ['terms', 'privacy', 'acceptable-use', 'ai-notice', 'cookie-policy', 'data-processing-addendum'],
  )
})

test('every published policy has substantive versioned content', () => {
  assert.equal(LEGAL_DOCUMENT_ORDER.length, 6)

  for (const key of LEGAL_DOCUMENT_ORDER) {
    const document = LEGAL_DOCUMENTS[key]
    assert.equal(document.version, LEGAL_VERSION)
    assert.ok(document.title.length > 3)
    assert.ok(document.description.length > 20)
    assert.ok(document.sections.length >= 5)
  }
})

test('signup clients and APIs enforce legal acceptance on both business and customer paths', () => {
  const sources = [
    'components/onboarding/BusinessSignupWizard.tsx',
    'components/site/CustomerSignupForm.tsx',
    'components/invite/InviteAcceptClient.tsx',
    'app/api/onboarding/business/complete/route.ts',
    'app/api/storefront/auth/signup/route.ts',
    'app/api/customer-invites/accept/route.ts',
  ].map((path) => readFileSync(path, 'utf8'))

  for (const source of sources.slice(0, 3)) {
    assert.match(source, /acceptedLegal/)
    assert.match(source, /createLegalAgreement/)
  }

  for (const source of sources.slice(3)) {
    assert.match(source, /validateLegalAgreement/)
    assert.match(source, /recordLegalConsent/)
  }
})

test('the consent migration is append-only and stores auditable evidence', () => {
  const migration = readFileSync(
    'supabase/migrations/20260726120000_legal_policies_and_consents.sql',
    'utf8',
  )

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.legal_consents/)
  assert.match(migration, /document_version text NOT NULL/)
  assert.match(migration, /accepted_at timestamptz NOT NULL/)
  assert.match(migration, /ip_address text/)
  assert.match(migration, /user_agent text/)
  assert.match(migration, /REVOKE UPDATE, DELETE ON public\.legal_consents/)
})
