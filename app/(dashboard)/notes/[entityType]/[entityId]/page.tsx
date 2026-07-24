import { notFound } from 'next/navigation'
import { UniversalNotesPanel } from '@/components/command-center/UniversalNotesPanel'
import { isTenantAdmin, requireCommandCenterContext } from '@/lib/command-center/context'
import {
  isNoteEntityType,
  loadUniversalNotesResult,
  NOTE_ENTITY_REGISTRY,
} from '@/lib/command-center/notes'

export const dynamic = 'force-dynamic'

export default async function RecordNotesPage({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>
}) {
  const { entityType, entityId } = await params
  if (!isNoteEntityType(entityType)) notFound()
  const context = await requireCommandCenterContext('use_modules')
  const notes = await loadUniversalNotesResult(context, entityType, entityId)

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
          Record workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {NOTE_ENTITY_REGISTRY[entityType].label} Notes
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Notes are tenant-scoped and attachments remain private.
        </p>
      </header>
      <UniversalNotesPanel
        entityType={entityType}
        entityId={entityId}
        initialNotes={notes.notes}
        loadError={notes.error}
        canManageVisibility={isTenantAdmin(context.role)}
      />
    </div>
  )
}
