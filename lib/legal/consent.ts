import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '@/lib/legal/policies'

export type LegalAccountType = 'business_admin' | 'business_user' | 'customer'

export interface LegalAgreement {
  accepted: true
  acceptedAt: string
  termsVersion: string
  privacyVersion: string
  acceptableUseVersion: string
  aiNoticeVersion: string
  dataProcessingAddendumVersion: string
  cookiePolicyVersion: string
}

type LegalAgreementValidation =
  | { ok: true; agreement: LegalAgreement }
  | { ok: false; error: string }

export const LEGAL_AGREEMENT_REQUIRED_MESSAGE =
  'You must agree to the Terms of Use and Acceptable Use Policy, and acknowledge the Privacy, Cookie, and AI Notices before creating an account.'

export function createLegalAgreement(now = new Date()): LegalAgreement {
  return {
    accepted: true,
    acceptedAt: now.toISOString(),
    termsVersion: LEGAL_DOCUMENTS.terms.version,
    privacyVersion: LEGAL_DOCUMENTS.privacy.version,
    acceptableUseVersion: LEGAL_DOCUMENTS['acceptable-use'].version,
    aiNoticeVersion: LEGAL_DOCUMENTS['ai-notice'].version,
    dataProcessingAddendumVersion: LEGAL_DOCUMENTS['data-processing-addendum'].version,
    cookiePolicyVersion: LEGAL_DOCUMENTS['cookie-policy'].version,
  }
}

export function validateLegalAgreement(
  input: unknown,
  _accountType: LegalAccountType,
  now = new Date()
): LegalAgreementValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: LEGAL_AGREEMENT_REQUIRED_MESSAGE }
  }

  const value = input as Record<string, unknown>
  if (value.accepted !== true) {
    return { ok: false, error: LEGAL_AGREEMENT_REQUIRED_MESSAGE }
  }

  const expected = createLegalAgreement(now)
  const versionFields: Array<keyof Omit<LegalAgreement, 'accepted' | 'acceptedAt'>> = [
    'termsVersion',
    'privacyVersion',
    'acceptableUseVersion',
    'aiNoticeVersion',
    'dataProcessingAddendumVersion',
    'cookiePolicyVersion',
  ]

  for (const field of versionFields) {
    if (value[field] !== expected[field]) {
      return {
        ok: false,
        error:
          'The legal documents changed while you were signing up. Review the current documents and try again.',
      }
    }
  }

  if (typeof value.acceptedAt !== 'string') {
    return { ok: false, error: LEGAL_AGREEMENT_REQUIRED_MESSAGE }
  }

  const acceptedAt = new Date(value.acceptedAt)
  const ageMs = now.getTime() - acceptedAt.getTime()
  if (
    Number.isNaN(acceptedAt.getTime()) ||
    ageMs < -5 * 60 * 1000 ||
    ageMs > 7 * 24 * 60 * 60 * 1000
  ) {
    return {
      ok: false,
      error: 'Your legal acknowledgement expired. Review the documents and submit the form again.',
    }
  }

  return {
    ok: true,
    agreement: {
      accepted: true,
      acceptedAt: acceptedAt.toISOString(),
      termsVersion: value.termsVersion as string,
      privacyVersion: value.privacyVersion as string,
      acceptableUseVersion: value.acceptableUseVersion as string,
      aiNoticeVersion: value.aiNoticeVersion as string,
      dataProcessingAddendumVersion: value.dataProcessingAddendumVersion as string,
      cookiePolicyVersion: value.cookiePolicyVersion as string,
    },
  }
}

export function getRequiredLegalDocuments(accountType: LegalAccountType): LegalDocumentKey[] {
  const common: LegalDocumentKey[] = [
    'terms',
    'privacy',
    'acceptable-use',
    'ai-notice',
    'cookie-policy',
  ]

  return accountType === 'customer' ? common : [...common, 'data-processing-addendum']
}

export function getAgreementVersion(
  agreement: LegalAgreement,
  documentKey: LegalDocumentKey
): string {
  switch (documentKey) {
    case 'terms':
      return agreement.termsVersion
    case 'privacy':
      return agreement.privacyVersion
    case 'acceptable-use':
      return agreement.acceptableUseVersion
    case 'ai-notice':
      return agreement.aiNoticeVersion
    case 'data-processing-addendum':
      return agreement.dataProcessingAddendumVersion
    case 'cookie-policy':
      return agreement.cookiePolicyVersion
  }
}
