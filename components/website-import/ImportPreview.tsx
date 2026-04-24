'use client'
// components/website-import/ImportPreview.tsx
// Shows a visual preview of the draft site structure that will be generated.
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layout, FileText, Mail, Star, HelpCircle,
  Image, Type, Globe, ChevronDown, ChevronRight, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fadeUp } from '@/lib/motion'

interface PreviewSection {
  section_type: string
  section_key:  string
  content:      Record<string, unknown>
}

interface PreviewPage {
  slug:     string
  title:    string
  page_type: string
  sections: PreviewSection[]
}

interface PreviewSettings {
  site_name:    string | null
  logo_url:     string | null
  favicon_url:  string | null
  brand_colors: Record<string, string>
}

interface Props {
  preview?: {
    settings: PreviewSettings
    pages:    PreviewPage[]
  } | null
  loading?: boolean
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  hero:          Layout,
  about:         Type,
  feature_grid:  Layout,
  contact:       Mail,
  testimonials:  Star,
  faq:           HelpCircle,
  image_gallery: Image,
  rich_text:     Type,
  cta:           Globe,
  banner:        Globe,
  product_grid:  Layout,
}

const SECTION_COLORS: Record<string, string> = {
  hero:          'bg-violet-400/10 text-violet-300/70',
  about:         'bg-blue-400/10   text-blue-300/70',
  feature_grid:  'bg-cyan-400/10   text-cyan-300/70',
  contact:       'bg-emerald-400/10 text-emerald-300/70',
  testimonials:  'bg-pink-400/10   text-pink-300/70',
  faq:           'bg-orange-400/10 text-orange-300/70',
  image_gallery: 'bg-rose-400/10   text-rose-300/70',
  cta:           'bg-amber-400/10  text-amber-300/70',
}

const PAGE_TYPE_COLORS: Record<string, string> = {
  home:    'text-amber-300/80',
  about:   'text-blue-300/80',
  contact: 'text-emerald-300/80',
  faq:     'text-orange-300/80',
  shop:    'text-violet-300/80',
  custom:  'text-white/50',
}

function getSectionLabel(type: string): string {
  const labels: Record<string, string> = {
    hero:          'Hero Banner',
    about:         'About Section',
    feature_grid:  'Services / Features',
    contact:       'Contact Info',
    testimonials:  'Testimonials',
    faq:           'FAQ',
    image_gallery: 'Image Gallery',
    cta:           'Call to Action',
    rich_text:     'Rich Text',
    banner:        'Banner',
    product_grid:  'Product Grid',
  }
  return labels[type] ?? type.replace(/_/g, ' ')
}

export function ImportPreview({ preview, loading }: Props) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set([0]))

  function togglePage(i: number) {
    setExpandedPages((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-8 text-center">
        <Eye size={24} className="mx-auto text-white/15 mb-3" />
        <p className="text-sm text-white/30">Run the import to see a preview of your draft site.</p>
      </div>
    )
  }

  const { settings, pages } = preview

  return (
    <div className="space-y-4">
      {/* Site settings summary */}
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-amber-300/70 uppercase tracking-wider">Site Settings</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-white/30 text-xs">Name</span>
            <p className="text-white/70 font-medium">{settings.site_name ?? '—'}</p>
          </div>
          <div>
            <span className="text-white/30 text-xs">Logo</span>
            <p className="text-white/70 text-xs truncate">{settings.logo_url ? '✓ Found' : '—'}</p>
          </div>
        </div>
        {settings.brand_colors && Object.keys(settings.brand_colors).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">Colors:</span>
            {Object.entries(settings.brand_colors).slice(0, 5).map(([key, color]) => (
              <span
                key={key}
                title={`${key}: ${color}`}
                className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pages */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
          Draft Pages ({pages.length})
        </p>

        {pages.map((page, i) => {
          const isExpanded  = expandedPages.has(i)
          const pageColor   = PAGE_TYPE_COLORS[page.page_type] ?? 'text-white/50'

          return (
            <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
              <button
                onClick={() => togglePage(i)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <FileText size={14} className={pageColor} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-white/70">{page.title}</span>
                  <span className="text-xs text-white/25 ml-2">/{page.slug || ''}</span>
                </div>
                <span className="text-xs text-white/25">{page.sections.length} sections</span>
                {isExpanded
                  ? <ChevronDown size={13} className="text-white/25" />
                  : <ChevronRight size={13} className="text-white/25" />
                }
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/5 px-4 py-3 space-y-1.5">
                      {page.sections.map((section, j) => {
                        const Icon     = SECTION_ICONS[section.section_type] ?? Layout
                        const colorCls = SECTION_COLORS[section.section_type] ?? 'bg-white/5 text-white/30'
                        const content  = section.content

                        const headline = typeof content.headline === 'string'
                          ? content.headline
                          : typeof content.text === 'string'
                            ? content.text
                            : null

                        return (
                          <motion.div
                            key={j}
                            variants={fadeUp}
                            initial="hidden"
                            animate="visible"
                            className="flex items-center gap-2.5"
                          >
                            <span className={cn('p-1 rounded-md flex-shrink-0', colorCls)}>
                              <Icon size={11} />
                            </span>
                            <span className="text-xs text-white/50 flex-1 min-w-0">
                              {getSectionLabel(section.section_type)}
                            </span>
                            {headline && (
                              <span className="text-xs text-white/25 truncate max-w-[160px]">
                                "{headline}"
                              </span>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
