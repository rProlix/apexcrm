// lib/pov/types.ts
// Shared types + constants for the POV Event App. Safe to import from both
// server and client code — contains no secrets.

export const WEBSITE_TYPES = ['business', 'creative', 'invitational', 'pov_event'] as const
export type WebsiteType = (typeof WEBSITE_TYPES)[number]

export interface WebsiteTypeOption {
  value:       WebsiteType
  label:       string
  description: string
}

export const WEBSITE_TYPE_OPTIONS: WebsiteTypeOption[] = [
  {
    value: 'business',
    label: 'Business Website',
    description:
      'For stores, service businesses, restaurants, salons, law firms, contractors, and local brands.',
  },
  {
    value: 'creative',
    label: 'Creative Portfolio',
    description:
      'For artists, photographers, creators, designers, musicians, and personal brands.',
  },
  {
    value: 'invitational',
    label: 'Invitation / Event Website',
    description:
      'For weddings, baby showers, birthdays, graduations, parties, and private events. Includes optional event camera features.',
  },
  {
    value: 'pov_event',
    label: 'POV Event App',
    description:
      'A private event camera app where guests upload photos, 15-second clips, and 30-second audio messages. The gallery reveals the next day.',
  },
]

export const POV_EVENT_TYPES = [
  'wedding',
  'baby_shower',
  'birthday',
  'quinceanera',
  'graduation',
  'corporate_event',
  'party',
  'other',
] as const
export type PovEventType = (typeof POV_EVENT_TYPES)[number]

export const POV_EVENT_TYPE_LABELS: Record<PovEventType, string> = {
  wedding:         'Wedding',
  baby_shower:     'Baby Shower',
  birthday:        'Birthday',
  quinceanera:     'Quinceañera',
  graduation:      'Graduation',
  corporate_event: 'Corporate Event',
  party:           'Party',
  other:           'Other',
}

export const POV_MEDIA_TYPES = ['photo', 'video', 'audio'] as const
export type PovMediaType = (typeof POV_MEDIA_TYPES)[number]

export const POV_MEDIA_STATUSES = ['pending', 'approved', 'hidden', 'reported', 'deleted'] as const
export type PovMediaStatus = (typeof POV_MEDIA_STATUSES)[number]

export const POV_THEMES = [
  { key: 'disposable', label: 'Disposable Camera', description: 'Grainy, nostalgic film aesthetic.' },
  { key: 'wedding_elegant', label: 'Elegant Wedding', description: 'Ivory, gold, serif elegance.' },
  { key: 'baby_pastel', label: 'Baby Shower Pastel', description: 'Soft pastels and rounded type.' },
  { key: 'birthday_colorful', label: 'Birthday Colorful', description: 'Bright, playful party colors.' },
  { key: 'luxury_black_gold', label: 'Luxury Black & Gold', description: 'Premium black with gold accents.' },
] as const
export type PovThemeKey = (typeof POV_THEMES)[number]['key']

// ─── Row shapes (these tables are not in the generated Supabase types yet) ────

export interface PovEventRow {
  id:                       string
  tenant_id:                string
  business_id:              string | null
  website_id:               string | null
  name:                     string
  slug:                     string
  event_type:               string | null
  event_date:               string | null
  event_start_at:           string | null
  event_end_at:             string | null
  gallery_reveal_at:        string
  timezone:                 string
  is_active:                boolean
  allow_photos:             boolean
  allow_videos:             boolean
  allow_audio:              boolean
  video_max_seconds:        number
  audio_max_seconds:        number
  require_pin:              boolean
  allow_guest_login:        boolean
  allow_guest_registration: boolean
  gallery_locked_message:   string
  gallery_unlocked_message: string
  theme:                    Record<string, unknown>
  settings:                 Record<string, unknown>
  created_by:               string | null
  created_at:               string
  updated_at:               string
}

export interface PovMediaRow {
  id:               string
  tenant_id:        string
  event_id:         string
  guest_id:         string | null
  media_type:       PovMediaType
  storage_provider: string | null
  bucket:           string | null
  storage_path:     string
  public_url:       string | null
  thumbnail_url:    string | null
  mime_type:        string | null
  file_size_bytes:  number | null
  duration_seconds: number | null
  width:            number | null
  height:           number | null
  caption:          string | null
  status:           PovMediaStatus
  metadata:         Record<string, unknown>
  created_at:       string
  updated_at:       string
}

export interface PovGuestRow {
  id:               string
  tenant_id:        string
  event_id:         string
  phone_number:     string
  phone_normalized: string
  display_name:     string | null
  pin_hash:         string
  pin_salt:         string | null
  last_login_at:    string | null
  created_at:       string
  updated_at:       string
}

/** Public-safe guest shape (never includes pin_hash / pin_salt). */
export interface PovGuestPublic {
  id:           string
  event_id:     string
  display_name: string | null
}

/** Allowed file types accepted by the upload API, per media type. */
export const POV_ALLOWED_MIME: Record<PovMediaType, string[]> = {
  photo: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: [
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a', 'audio/m4a',
    'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  ],
}

/** Per-media-type max upload size, in bytes. */
export const POV_MAX_BYTES: Record<PovMediaType, number> = {
  photo: 25 * 1024 * 1024, // 25 MB
  video: 70 * 1024 * 1024, // 70 MB (15s clip)
  audio: 15 * 1024 * 1024, // 15 MB (30s message)
}
