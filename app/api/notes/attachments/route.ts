import { NextRequest, NextResponse } from 'next/server'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { CommandCenterAccessError, requireCommandCenterContext } from '@/lib/command-center/context'
import { canEditNote, validateNoteEntity } from '@/lib/command-center/notes'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import { uploadFile } from '@/lib/storage/uploadFile'

export async function POST(request: NextRequest) {
  try {
    const context = await requireCommandCenterContext('use_modules')
    const form = await request.formData()
    const noteId = String(form.get('noteId') ?? '')
    const file = form.get('file')
    if (!noteId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a file to attach.' }, { status: 400 })
    }

    const { data: note, error } = await context.db
      .from('universal_notes')
      .select('id, entity_type, entity_id, author_user_id')
      .eq('id', noteId)
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .single()
    if (error || !note) {
      return NextResponse.json({ error: 'Note was not found.' }, { status: 404 })
    }
    if (!canEditNote(context.role, context.user.id, note.author_user_id)) {
      return NextResponse.json(
        { error: 'You cannot add attachments to this note.' },
        { status: 403 }
      )
    }
    await validateNoteEntity(context, note.entity_type, note.entity_id)

    const upload = await uploadFile({
      bucket: STORAGE_BUCKETS.DOCUMENT_ASSETS,
      tenantId: context.tenantId,
      pathParts: ['notes', note.id, crypto.randomUUID()],
      fileName: file.name,
      buffer: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type || 'application/octet-stream',
      withSignedUrl: false,
    })
    const { data: attachment, error: insertError } = await context.db
      .from('universal_note_attachments')
      .insert({
        tenant_id: context.tenantId,
        note_id: note.id,
        entity_type: note.entity_type,
        entity_id: note.entity_id,
        storage_bucket: upload.bucket,
        storage_path: upload.path,
        file_name: file.name.slice(0, 200),
        mime_type: upload.mimeType,
        size_bytes: upload.sizeBytes,
        uploaded_by: context.user.id,
      })
      .select('id')
      .single()
    if (insertError || !attachment) {
      await context.db.storage.from(upload.bucket).remove([upload.path])
      throw new Error(`Attachment record could not be created: ${insertError?.code}`)
    }

    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.attachment.uploaded',
      metadata: {
        entity_type: note.entity_type,
        entity_id: note.entity_id,
        note_id: note.id,
        attachment_id: attachment.id,
        mime_type: upload.mimeType,
        size_bytes: upload.sizeBytes,
      },
    })
    return NextResponse.json({ id: attachment.id }, { status: 201 })
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 400
    return NextResponse.json(
      {
        error:
          error instanceof CommandCenterAccessError
            ? error.message
            : 'Attachment upload failed. Check the file type and size, then try again.',
      },
      { status }
    )
  }
}
