import type { Json } from '@/lib/supabase/types'
import type { QuickPeekMedia } from '@/lib/command-center/experience'

export interface DamageEvidenceImage {
  imageId: string
  businessId: string
  alt?: string
  caption?: string
}

export function damageEvidenceMetadata(evidence: DamageEvidenceImage | null): Json {
  if (!evidence) return {}
  return {
    evidence_image_id: evidence.imageId,
    evidence_business_id: evidence.businessId,
    evidence_image_alt: evidence.alt ?? 'Van damage inspection image',
    evidence_image_caption: evidence.caption ?? 'Latest inspection evidence',
  }
}

export function damageEvidenceFromMetadata(metadata: Json): DamageEvidenceImage | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const imageId = metadata.evidence_image_id
  const businessId = metadata.evidence_business_id
  if (typeof imageId !== 'string' || typeof businessId !== 'string') return null
  return {
    imageId,
    businessId,
    alt:
      typeof metadata.evidence_image_alt === 'string'
        ? metadata.evidence_image_alt
        : 'Van damage inspection image',
    caption:
      typeof metadata.evidence_image_caption === 'string'
        ? metadata.evidence_image_caption
        : undefined,
  }
}

export function damageEvidenceToQuickPeekMedia(
  evidence: DamageEvidenceImage | null
): QuickPeekMedia[] | undefined {
  if (!evidence) return undefined
  return [
    {
      kind: 'damage_image',
      imageId: evidence.imageId,
      businessId: evidence.businessId,
      alt: evidence.alt ?? 'Van damage inspection image',
      caption: evidence.caption,
    },
  ]
}
