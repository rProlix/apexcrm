// lib/pov/invitationPages.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Seeds a real, renderable default Invitation / Event website
// (home + details + schedule pages) using the existing site_pages / site_sections
// schema and the existing public renderer. Only runs when the tenant has no
// pages yet, so it never clobbers an existing site. Best-effort + non-fatal.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `https://${ROOT_DOMAIN}`
}

interface InvitationOpts {
  eventName?: string | null
  eventDate?: string | null
  eventSlug?: string | null   // present when POV camera is enabled
  povEnabled?: boolean
}

/**
 * Creates default invitation pages for a tenant if none exist yet.
 * Returns true if pages were created, false if skipped.
 */
export async function ensureInvitationPages(tenantId: string, opts: InvitationOpts = {}): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any

  try {
    const { data: existing } = await db
      .from('site_pages')
      .select('id')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .limit(1)
    if (existing && existing.length) return false
  } catch {
    return false
  }

  const name = opts.eventName?.trim() || 'Our Event'
  const dateLine = opts.eventDate ? new Date(`${opts.eventDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : ''
  const cameraHref = opts.povEnabled && opts.eventSlug ? `${appBase()}/pov/${opts.eventSlug}/camera` : ''
  const galleryHref = opts.povEnabled && opts.eventSlug ? `${appBase()}/pov/${opts.eventSlug}/gallery` : ''

  async function createPage(slug: string, title: string, pageType: string, sortOrder: number) {
    const { data } = await db.from('site_pages').insert({
      tenant_id: tenantId, slug, title, page_type: pageType, status: 'published', sort_order: sortOrder,
    }).select('id').single()
    return data?.id as string | undefined
  }

  async function addSection(pageId: string, sectionType: string, content: Record<string, unknown>, sort: number) {
    await db.from('site_sections').insert({
      tenant_id: tenantId, page_id: pageId, section_type: sectionType,
      content, sort_order: sort, is_visible: true,
    })
  }

  try {
    // ── Home / invitation landing ──────────────────────────────────────────
    const homeId = await createPage('', `${name} — Invitation`, 'home', 0)
    if (homeId) {
      await addSection(homeId, 'hero', {
        headline: name,
        subheadline: dateLine ? `You're invited · ${dateLine}` : "You're invited.",
        ...(cameraHref ? { ctaLabel: 'Open Event Camera', ctaHref: cameraHref } : {}),
        ...(galleryHref ? { ctaSecondaryLabel: 'View Gallery', ctaSecondaryHref: galleryHref } : {}),
        align: 'center',
      }, 0)
      await addSection(homeId, 'rich_text', {
        html: `<h2>Welcome</h2><p>We can't wait to celebrate with you${dateLine ? ` on ${dateLine}` : ''}. Find the details, schedule, and location below.</p>`,
      }, 1)
      if (cameraHref) {
        await addSection(homeId, 'cta', {
          headline: 'Capture the day from your point of view',
          body: 'Use your phone number and PIN to upload photos, short clips, and audio. The gallery unlocks the next day.',
          ctaLabel: 'Enter the Event Camera',
          ctaHref: cameraHref,
          align: 'center',
        }, 2)
      }
    }

    // ── Details page ─────────────────────────────────────────────────────────
    const detailsId = await createPage('details', 'Details', 'custom', 1)
    if (detailsId) {
      await addSection(detailsId, 'rich_text', {
        html: `<h2>Event Details</h2><p>Add your dress code, registry, parking, and any notes for guests here.</p>`,
      }, 0)
    }

    // ── Schedule / location page ───────────────────────────────────────────
    const scheduleId = await createPage('schedule', 'Schedule & Location', 'custom', 2)
    if (scheduleId) {
      await addSection(scheduleId, 'rich_text', {
        html: `<h2>Schedule & Location</h2><p>Add your ceremony, reception, and venue address here.</p>`,
      }, 0)
    }

    return true
  } catch (e) {
    console.warn('[pov:invitationPages] could not scaffold pages:', e instanceof Error ? e.message : e)
    return false
  }
}
