import { NextRequest, NextResponse } from 'next/server'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { CommandCenterAccessError, requireCommandCenterContext } from '@/lib/command-center/context'
import { validateNoteEntity } from '@/lib/command-center/notes'
import { createSignedFileUrl } from '@/lib/storage/getFileUrl'
import type { StorageBucket } from '@/lib/storage/buckets'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const context = await requireCommandCenterContext('use_modules')
    const { attachmentId } = await params
    const { data: attachment, error } = await context.db
      .from('universal_note_attachments')
      .select('id, entity_type, entity_id, storage_bucket, storage_path, file_name, mime_type')
      .eq('id', attachmentId)
      .eq('tenant_id', context.tenantId)
      .single()
    if (error || !attachment) {
      return NextResponse.json({ error: 'Attachment was not found.' }, { status: 404 })
    }
    await validateNoteEntity(context, attachment.entity_type, attachment.entity_id)
    const signedUrl = await createSignedFileUrl(
      attachment.storage_bucket as StorageBucket,
      attachment.storage_path,
      300
    )
    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.attachment.downloaded',
      metadata: {
        attachment_id: attachment.id,
        entity_type: attachment.entity_type,
        entity_id: attachment.entity_id,
      },
    })
    return NextResponse.redirect(signedUrl, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${safeHeaderFileName(attachment.file_name)}"`,
      },
    })
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 400
    return NextResponse.json(
      {
        error:
          error instanceof CommandCenterAccessError ? error.message : 'Attachment access failed.',
      },
      { status }
    )
  }
}

function safeHeaderFileName(value: string): string {
  return value.replace(/[\r\n"]/g, '_').slice(0, 180)
}
