import type { AnyRole } from '@/lib/auth/types'
import type { NoteEntityType } from './types'

export const NOTE_ENTITY_TYPES: readonly NoteEntityType[] = [
  'customer',
  'vehicle',
  'inspection',
  'damage_case',
  'maintenance_item',
  'appointment',
  'order',
  'payment',
  'website_lead',
]

export function isNoteEntityType(value: string): value is NoteEntityType {
  return NOTE_ENTITY_TYPES.includes(value as NoteEntityType)
}

export function canEditNote(role: AnyRole, currentUserId: string, authorUserId: string): boolean {
  if (role === 'customer') return false
  return ['owner', 'admin', 'manager'].includes(role) || currentUserId === authorUserId
}
