import 'server-only'

import type { CommandCenterContext } from './context'
import { assertActiveModule, CommandCenterAccessError } from './context'
import type { NoteEntityType, UniversalNote } from './types'
import { canEditNote } from './notePolicy'
export { canEditNote, isNoteEntityType } from './notePolicy'

interface NoteEntityDefinition {
  table: string
  moduleKeys: string[]
  label: string
}

export const NOTE_ENTITY_REGISTRY: Record<NoteEntityType, NoteEntityDefinition> = {
  customer: { table: 'customers', moduleKeys: ['customers'], label: 'Customer' },
  vehicle: { table: 'vehicles', moduleKeys: ['vehicles'], label: 'Vehicle' },
  inspection: {
    table: 'van_damage_inspections',
    moduleKeys: ['damage_ai'],
    label: 'Inspection',
  },
  damage_case: {
    table: 'van_damage_items',
    moduleKeys: ['damage_ai'],
    label: 'Damage case',
  },
  maintenance_item: {
    table: 'fleet_maintenance_items',
    moduleKeys: ['maintenance'],
    label: 'Maintenance item',
  },
  appointment: {
    table: 'appointments',
    moduleKeys: ['appointments'],
    label: 'Appointment',
  },
  order: { table: 'orders', moduleKeys: ['store'], label: 'Order' },
  payment: { table: 'payments', moduleKeys: ['payments'], label: 'Payment' },
  website_lead: {
    table: 'leads',
    moduleKeys: ['website', 'leads', 'customers'],
    label: 'Website lead',
  },
}

export async function validateNoteEntity(
  context: CommandCenterContext,
  entityType: NoteEntityType,
  entityId: string
): Promise<void> {
  const definition = NOTE_ENTITY_REGISTRY[entityType]
  const activeModule = definition.moduleKeys.find((moduleKey) =>
    context.activeModuleSet.has(moduleKey)
  )
  if (!activeModule) {
    throw new CommandCenterAccessError('This record belongs to an inactive module.', 404)
  }
  assertActiveModule(context, activeModule)

  const { data, error } = await untypedFrom(context, definition.table)
    .select('id')
    .eq('id', entityId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle()
  if (error) throw new Error(`Record validation failed: ${error.code}`)
  if (!data) throw new CommandCenterAccessError(`${definition.label} was not found.`, 404)
}

export async function loadUniversalNotes(
  context: CommandCenterContext,
  entityType: NoteEntityType,
  entityId: string
): Promise<UniversalNote[]> {
  await validateNoteEntity(context, entityType, entityId)

  const [{ data: notes, error }, { data: attachments, error: attachmentError }] = await Promise.all(
    [
      context.db
        .from('universal_notes')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      context.db
        .from('universal_note_attachments')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true }),
    ]
  )
  if (error || attachmentError) {
    throw new Error(`Notes could not be loaded: ${error?.code ?? attachmentError?.code}`)
  }

  const attachmentsByNote = new Map<string, UniversalNote['attachments']>()
  for (const attachment of attachments ?? []) {
    attachmentsByNote.set(attachment.note_id, [
      ...(attachmentsByNote.get(attachment.note_id) ?? []),
      {
        id: attachment.id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        downloadHref: `/api/notes/attachments/${attachment.id}`,
        createdAt: attachment.created_at,
      },
    ])
  }

  return (notes ?? []).map((note) => ({
    id: note.id,
    entityType: note.entity_type,
    entityId: note.entity_id,
    authorUserId: note.author_user_id,
    authorDisplay: note.author_display_snapshot,
    body: note.body,
    source: note.source,
    visibility: note.visibility,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    editedAt: note.edited_at,
    canEdit: canEditNote(context.role, context.user.id, note.author_user_id),
    attachments: attachmentsByNote.get(note.id) ?? [],
  }))
}

export async function loadUniversalNotesResult(
  context: CommandCenterContext,
  entityType: NoteEntityType,
  entityId: string
): Promise<{ notes: UniversalNote[]; error: string | null }> {
  try {
    return {
      notes: await loadUniversalNotes(context, entityType, entityId),
      error: null,
    }
  } catch (error) {
    console.error('[command-center:notes] load failed', {
      entityType,
      code: error instanceof Error ? error.name : 'unknown',
    })
    return {
      notes: [],
      error: 'We couldn’t load notes and attachments for this record.',
    }
  }
}

interface UntypedEntityQuery {
  select(columns: string): UntypedEntityQuery
  eq(column: string, value: unknown): UntypedEntityQuery
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null
    error: { code: string } | null
  }>
}

function untypedFrom(context: CommandCenterContext, table: string): UntypedEntityQuery {
  return (context.db as unknown as { from(tableName: string): UntypedEntityQuery }).from(table)
}
