import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getAgreementVersion,
  getRequiredLegalDocuments,
  validateLegalAgreement,
  type LegalAccountType,
  type LegalAgreement,
} from '@/lib/legal/consent'
import type { Database, Json } from '@/lib/supabase/types'

interface RecordLegalConsentInput {
  authUserId: string
  tenantId?: string | null
  subjectEmail: string
  accountType: LegalAccountType
  agreement: LegalAgreement
  source: string
  request?: Request
  headers?: Headers
  metadata?: Record<string, unknown>
}

function firstForwardedIp(headers: Headers | undefined): string | null {
  const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers?.get('x-real-ip')?.trim() || null
}

export async function recordLegalConsent(input: RecordLegalConsentInput): Promise<void> {
  const validation = validateLegalAgreement(input.agreement, input.accountType)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const requestHeaders = input.request?.headers ?? input.headers
  const userAgent = requestHeaders?.get('user-agent')?.slice(0, 1024) ?? null
  const ipAddress = firstForwardedIp(requestHeaders)
  const documents = getRequiredLegalDocuments(input.accountType)

  const rows: Database['public']['Tables']['legal_consents']['Insert'][] = documents.map(
    (documentKey) => ({
      auth_user_id: input.authUserId,
      tenant_id: input.tenantId ?? null,
      subject_email: input.subjectEmail.trim().toLowerCase(),
      account_type: input.accountType,
      document_key: documentKey,
      document_version: getAgreementVersion(validation.agreement, documentKey),
      accepted_at: validation.agreement.acceptedAt,
      source: input.source,
      ip_address: ipAddress,
      user_agent: userAgent,
      evidence: {
        affirmative_action: 'required_checkbox',
        all_document_versions: {
          terms: validation.agreement.termsVersion,
          privacy: validation.agreement.privacyVersion,
          acceptable_use: validation.agreement.acceptableUseVersion,
          ai_notice: validation.agreement.aiNoticeVersion,
          data_processing_addendum: validation.agreement.dataProcessingAddendumVersion,
          cookie_policy: validation.agreement.cookiePolicyVersion,
        },
        ...input.metadata,
      } as Json,
    })
  )

  const supabase = getSupabaseServerClient()
  const { error } = await supabase.from('legal_consents').upsert(rows, {
    onConflict: 'auth_user_id,account_type,document_key,document_version,source',
    ignoreDuplicates: true,
  })

  if (error) {
    console.error('[recordLegalConsent] insert failed:', error.message)
    throw new Error('We could not record your legal acknowledgement. Please try again.')
  }
}
