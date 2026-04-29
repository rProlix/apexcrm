'use client'
// components/website/WebsiteOverviewClient.tsx
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Globe, FileText, Navigation, Palette, Settings,
  CheckCircle2, Clock, ExternalLink, Zap, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { fadeUp, staggerContainer } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface SitePage {
  id: string; slug: string; title: string | null
  page_type: string; status: string; sort_order: number; created_at: string
}
interface SiteSettings {
  id: string; tenant_id: string; site_name: string | null; logo_url: string | null
  is_published: boolean; custom_domain: string | null; subdomain: string | null
  updated_at: string
}

interface Props {
  tenantId:        string
  initialSettings: SiteSettings | null
  initialPages:    SitePage[]
  navCount:        number
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export function WebsiteOverviewClient({ tenantId, initialSettings, initialPages, navCount }: Props) {
  const [settings,   setSettings]   = useState<SiteSettings | null>(initialSettings)
  const [publishing, setPublishing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const isPublished  = settings?.is_published ?? false
  const publishedUrl = settings?.custom_domain
    ? `https://${settings.custom_domain}`
    : settings?.subdomain
      ? `https://${settings.subdomain}.${ROOT_DOMAIN}`
      : null

  async function togglePublish() {
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch('/api/website/publish', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ publish: !isPublished, tenant_id: tenantId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setSettings(json.settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setPublishing(false)
    }
  }

  const publishedCount = initialPages.filter((p) => p.status === 'published').length
  const draftCount     = initialPages.filter((p) => p.status === 'draft').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Website Builder</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {settings?.site_name ?? 'Your public website'} — manage, edit, and publish
          </p>
        </div>
        <div className="flex items-center gap-3">
          {publishedUrl && (
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Site
            </a>
          )}
          <Button
            variant={isPublished ? 'secondary' : 'primary'}
            onClick={togglePublish}
            loading={publishing}
          >
            {isPublished ? (
              <><Clock className="h-4 w-4" /> Unpublish</>
            ) : (
              <><Zap className="h-4 w-4" /> Publish Site</>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Status banner */}
      <div className={cn(
        'rounded-2xl border px-5 py-4 flex items-center gap-4',
        isPublished
          ? 'bg-emerald-500/8 border-emerald-500/20'
          : 'bg-gold-500/8 border-gold-500/20',
      )}>
        {isPublished
          ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          : <Clock className="h-5 w-5 text-gold-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', isPublished ? 'text-emerald-400' : 'text-gold-400')}>
            {isPublished ? 'Your site is live' : 'Site is in draft mode'}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            {isPublished
              ? publishedUrl
                ? `Accessible at ${publishedUrl}`
                : 'Published — configure a domain in Settings'
              : 'Changes are saved but not visible to the public yet'}
          </p>
        </div>
        {isPublished && publishedUrl && (
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </a>
        )}
      </div>

      {/* Stats row */}
      <motion.div
        variants={staggerContainer(0.06)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: 'Total Pages',  value: initialPages.length, color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20' },
          { label: 'Published',    value: publishedCount,      color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
          { label: 'Drafts',       value: draftCount,          color: 'text-gold-400',    bg: 'bg-gold-400/10 border-gold-400/20' },
          { label: 'Nav Items',    value: navCount,            color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            variants={fadeUp}
            className="rounded-2xl bg-graphite-800/60 border border-surface-border px-5 py-4"
          >
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Nav grid */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">Manage</h2>
        <motion.div
          variants={staggerContainer(0.05)}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            {
              href:        '/website/pages',
              icon:        FileText,
              label:       'Pages',
              description: 'Create, edit, and manage your site pages and content sections',
              color:       'text-violet-400',
              bg:          'bg-violet-400/10 border-violet-400/20',
              badge:       `${initialPages.length} pages`,
            },
            {
              href:        '/website/navigation',
              icon:        Navigation,
              label:       'Navigation',
              description: 'Configure header and footer links for your public site',
              color:       'text-blue-400',
              bg:          'bg-blue-400/10 border-blue-400/20',
              badge:       `${navCount} links`,
            },
            {
              href:        '/website/theme',
              icon:        Palette,
              label:       'Theme',
              description: 'Customize colors, fonts, logo, and brand identity',
              color:       'text-pink-400',
              bg:          'bg-pink-400/10 border-pink-400/20',
              badge:       null,
            },
            {
              href:        '/website/settings',
              icon:        Settings,
              label:       'Settings',
              description: 'Domain configuration, SEO defaults, and site metadata',
              color:       'text-gold-400',
              bg:          'bg-gold-400/10 border-gold-400/20',
              badge:       null,
            },
          ].map((item) => (
            <motion.div key={item.href} variants={fadeUp}>
              <Link
                href={item.href}
                className="group block rounded-2xl bg-graphite-800/60 border border-surface-border hover:border-white/20 p-5 transition-all duration-200 hover:shadow-panel-lg h-full"
              >
                <div className="flex items-start gap-4">
                  <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center shrink-0', item.bg)}>
                    <item.icon className={cn('h-5 w-5', item.color)} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white group-hover:text-gold-400 transition-colors">
                        {item.label}
                      </p>
                      {item.badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-white/8 text-white/40 font-medium">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Recent pages */}
      {initialPages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">Pages</h2>
            <Link href="/website/pages" className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
              Manage all →
            </Link>
          </div>
          <div className="rounded-2xl border border-surface-border overflow-hidden">
            {initialPages.slice(0, 6).map((page, i) => (
              <div
                key={page.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5',
                  i !== 0 && 'border-t border-surface-border',
                  'hover:bg-white/3 transition-colors'
                )}
              >
                <Globe className="h-4 w-4 text-white/20 shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{page.title ?? page.slug}</p>
                  <p className="text-xs text-white/30">/{page.slug}</p>
                </div>
                <span className={cn(
                  'text-2xs px-2 py-0.5 rounded-md font-medium border',
                  page.status === 'published'
                    ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                    : 'text-gold-400 bg-gold-400/10 border-gold-400/20',
                )}>
                  {page.status}
                </span>
                <Link
                  href="/website/pages"
                  className="text-xs text-white/30 hover:text-white/70 transition-colors shrink-0"
                >
                  Edit →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {initialPages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-surface-border">
          <div className="h-16 w-16 rounded-2xl bg-violet-400/10 border border-violet-400/20 flex items-center justify-center mb-4">
            <Globe className="h-8 w-8 text-violet-400/60" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No pages yet</h3>
          <p className="text-sm text-white/40 mb-6 max-w-xs">
            Create your first page to start building your public website.
          </p>
          <Link href="/website/pages">
            <Button variant="primary">
              <FileText className="h-4 w-4" />
              Create First Page
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
