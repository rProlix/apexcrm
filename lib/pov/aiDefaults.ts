// lib/pov/aiDefaults.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic default-content generator for the POV Event App.
//
// This powers the "AI autofill" experience for pov_event sites without needing
// an LLM round-trip: it produces sensible landing copy, theme, and messages
// based on the event type. The website AI layer can call generatePovDefaults()
// to seed an event, and may later replace these with model-generated copy.
//
// Safe to import from server and client (no secrets).
// ─────────────────────────────────────────────────────────────────────────────

import type { PovEventType, PovThemeKey } from '@/lib/pov/types'

export interface PovDefaults {
  theme_key:                PovThemeKey
  headline:                 string
  subheadline:              string
  upload_instructions:      string
  gallery_locked_message:   string
  gallery_unlocked_message: string
  upload_success_message:   string
}

const THEME_BY_EVENT: Record<PovEventType, PovThemeKey> = {
  wedding:         'wedding_elegant',
  baby_shower:     'baby_pastel',
  birthday:        'birthday_colorful',
  quinceanera:     'luxury_black_gold',
  graduation:      'luxury_black_gold',
  corporate_event: 'luxury_black_gold',
  party:           'disposable',
  other:           'disposable',
}

const HEADLINE_BY_EVENT: Partial<Record<PovEventType, string>> = {
  wedding:         'Capture our wedding from your point of view.',
  baby_shower:     'Help us capture every sweet moment.',
  birthday:        'Capture the party from your point of view.',
  quinceanera:     'Capture the celebration from your point of view.',
  graduation:      'Capture the milestone from your point of view.',
  corporate_event: 'Capture the event from your point of view.',
  party:           'Capture the night from your point of view.',
  other:           'Capture the moment from your point of view.',
}

export function generatePovDefaults(eventType: PovEventType | string | null | undefined): PovDefaults {
  const et = (eventType ?? 'other') as PovEventType
  const theme_key = THEME_BY_EVENT[et] ?? 'disposable'
  const headline = HEADLINE_BY_EVENT[et] ?? 'Capture the moment from your point of view.'

  return {
    theme_key,
    headline,
    subheadline:              'Use your phone number and PIN to enter the private event camera.',
    upload_instructions:      'Snap a photo, record a 15-second clip, or leave a 30-second audio message. Everything you add reveals to the whole gallery tomorrow.',
    gallery_locked_message:   'The gallery is developing. Come back tomorrow.',
    gallery_unlocked_message: 'The memories are ready.',
    upload_success_message:   'Memory saved. The gallery unlocks tomorrow.',
  }
}
