'use server'

import { revalidatePath } from 'next/cache'
import { recordCommandAudit } from './audit'
import { isTenantAdmin, requireCommandCenterContext } from './context'
import { canEditNote, isNoteEntityType, validateNoteEntity } from './notes'

const NOTE_BODY_MAX = 10_000

export async function createUniversalNote(input: {
  entityType: string
  entityId: string
  body: string
  visibility?: 'internal' | 'staff_admin' | 'customer_visible'
}): Promise<{ id: string }> {
  const context = await requireCommandCenterContext('use_modules')
  if (!isNoteEntityType(input.entityType)) throw new Error('Unsupported note record type.')
  await validateNoteEntity(context, input.entityType, input.entityId)
  const body = normalizeBody(input.body)
  const visibility = input.visibility ?? 'internal'
  if (visibility === 'customer_visible' && !isTenantAdmin(context.role)) {
    throw new Error('Only an administrator can make a note customer-visible.')
  }

  const { data, error } = await context.db
    .from('universal_notes')
    .insert({
      tenant_id: context.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      author_user_id: context.user.id,
      author_display_snapshot: displayName(context.user.email),
      body,
      source: 'manual',
      visibility,
      is_internal: visibility !== 'customer_visible',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Note could not be created: ${error?.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.note.created',
    metadata: {
      entity_type: input.entityType,
      entity_id: input.entityId,
      note_id: data.id,
    },
  })
  revalidateNotePaths(input.entityType, input.entityId)
  return { id: data.id }
}

export async function editUniversalNote(input: {
  noteId: string
  body: string
  visibility?: 'internal' | 'staff_admin' | 'customer_visible'
}): Promise<void> {
  const context = await requireCommandCenterContext('use_modules')
  const { data: note, error } = await context.db
    .from('universal_notes')
    .select('id, entity_type, entity_id, author_user_id')
    .eq('id', input.noteId)
    .eq('tenant_id', context.tenantId)
    .is('archived_at', null)
    .single()
  if (error || !note) throw new Error('Note was not found.')
  if (!canEditNote(context.role, context.user.id, note.author_user_id)) {
    throw new Error('You cannot edit this note.')
  }
  await validateNoteEntity(context, note.entity_type, note.entity_id)
  const visibility = input.visibility ?? 'internal'
  if (visibility === 'customer_visible' && !isTenantAdmin(context.role)) {
    throw new Error('Only an administrator can make a note customer-visible.')
  }

  const { error: updateError } = await context.db
    .from('universal_notes')
    .update({
      body: normalizeBody(input.body),
      visibility,
      is_internal: visibility !== 'customer_visible',
      edited_at: new Date().toISOString(),
    })
    .eq('id', note.id)
    .eq('tenant_id', context.tenantId)
  if (updateError) throw new Error(`Note could not be updated: ${updateError.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.note.edited',
    metadata: {
      entity_type: note.entity_type,
      entity_id: note.entity_id,
      note_id: note.id,
    },
  })
  revalidateNotePaths(note.entity_type, note.entity_id)
}

export async function archiveUniversalNote(noteId: string): Promise<void> {
  const context = await requireCommandCenterContext('use_modules')
  const { data: note, error } = await context.db
    .from('universal_notes')
    .select('id, entity_type, entity_id, author_user_id')
    .eq('id', noteId)
    .eq('tenant_id', context.tenantId)
    .is('archived_at', null)
    .single()
  if (error || !note) throw new Error('Note was not found.')
  if (!canEditNote(context.role, context.user.id, note.author_user_id)) {
    throw new Error('You cannot archive this note.')
  }
  await validateNoteEntity(context, note.entity_type, note.entity_id)

  const { error: updateError } = await context.db
    .from('universal_notes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', note.id)
    .eq('tenant_id', context.tenantId)
  if (updateError) throw new Error(`Note could not be archived: ${updateError.code}`)

  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.note.deleted',
    metadata: {
      entity_type: note.entity_type,
      entity_id: note.entity_id,
      note_id: note.id,
    },
  })
  revalidateNotePaths(note.entity_type, note.entity_id)
}

function normalizeBody(value: string): string {
  const body = value.trim()
  if (!body) throw new Error('Enter a note before saving.')
  if (body.length > NOTE_BODY_MAX) {
    throw new Error(`Notes are limited to ${NOTE_BODY_MAX.toLocaleString()} characters.`)
  }
  return body
}

function displayName(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function revalidateNotePaths(entityType: string, entityId: string): void {
  revalidatePath('/activity')
  if (entityType === 'customer') revalidatePath(`/customers/${entityId}`)
  if (entityType === 'vehicle') revalidatePath(`/dashboard/vehicles/${entityId}`)
  if (entityType === 'inspection') {
    revalidatePath(`/dashboard/damage-ai/inspections/${entityId}`)
  }
}
