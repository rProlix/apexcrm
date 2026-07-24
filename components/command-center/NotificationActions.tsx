'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { markNotificationRead } from '@/lib/command-center/notificationActions'

export function MarkNotificationRead({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationRead(id)
          router.refresh()
        })
      }
      className="inline-flex items-center gap-1 text-xs text-white/35 hover:text-white disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      Mark read
    </button>
  )
}
