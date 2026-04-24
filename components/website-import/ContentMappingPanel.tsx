'use client'
// components/website-import/ContentMappingPanel.tsx
// Displays a visual map of how imported fields will be applied to website sections.
import { ArrowRight, Layout, Mail, Star, HelpCircle, Image, Type, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MappingRow {
  fieldKey:      string
  fieldLabel:    string
  sectionLabel:  string
  sectionType:   string
  approved:      boolean
  confidence:    number
}

interface Props {
  results: Array<{
    result_key:      string
    mapped_section:  string | null
    confidence_score: number
    approved:        boolean
  }>
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  hero:          Layout,
  about:         Type,
  feature_grid:  Layout,
  contact:       Mail,
  testimonials:  Star,
  faq:           HelpCircle,
  image_gallery: Image,
  footer:        Globe,
  site_settings: Globe,
}

const SECTION_COLORS: Record<string, string> = {
  site_settings: 'text-amber-300/70  bg-amber-400/10',
  hero:          'text-violet-300/70 bg-violet-400/10',
  'hero/about':  'text-violet-300/70 bg-violet-400/10',
  about:         'text-blue-300/70   bg-blue-400/10',
  feature_grid:  'text-cyan-300/70   bg-cyan-400/10',
  contact:       'text-emerald-300/70 bg-emerald-400/10',
  testimonials:  'text-pink-300/70   bg-pink-400/10',
  faq:           'text-orange-300/70 bg-orange-400/10',
  gallery:       'text-rose-300/70   bg-rose-400/10',
  'gallery/hero':'text-rose-300/70   bg-rose-400/10',
  footer:        'text-slate-300/70  bg-slate-400/10',
  page_meta:     'text-teal-300/70   bg-teal-400/10',
}

const FIELD_LABELS: Record<string, string> = {
  businessName:   'Business Name',
  description:    'Description',
  logoUrl:        'Logo',
  faviconUrl:     'Favicon',
  phone:          'Phone',
  email:          'Email',
  address:        'Address',
  hours:          'Hours',
  socialLinks:    'Social Links',
  services:       'Services',
  testimonials:   'Testimonials',
  faqItems:       'FAQ',
  images:         'Images',
  brandColors:    'Brand Colors',
  seoTitle:       'SEO Title',
  seoDescription: 'SEO Description',
  mapUrl:         'Map Embed',
  latitude:       'Latitude',
  longitude:      'Longitude',
}

// Group fields by their mapped_section
function groupBySection(
  results: Props['results'],
): Map<string, typeof results> {
  const map = new Map<string, typeof results>()
  for (const r of results) {
    const section = r.mapped_section ?? 'other'
    if (!map.has(section)) map.set(section, [])
    map.get(section)!.push(r)
  }
  return map
}

export function ContentMappingPanel({ results }: Props) {
  const grouped = groupBySection(results)

  return (
    <div className="space-y-3">
      {[...grouped.entries()].map(([section, fields]) => {
        const Icon = SECTION_ICONS[section.split('/')[0]] ?? Layout
        const colorClass = SECTION_COLORS[section] ?? 'text-white/40 bg-white/5'
        const approvedCount = fields.filter((f) => f.approved).length

        return (
          <div key={section} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5">
              <span className={cn('p-1.5 rounded-md flex-shrink-0', colorClass)}>
                <Icon size={13} />
              </span>
              <span className="text-sm font-medium text-white/70 flex-1 capitalize">
                {section.replace(/_/g, ' ').replace(/\//g, ' / ')}
              </span>
              <span className="text-xs text-white/30">
                {approvedCount}/{fields.length} approved
              </span>
            </div>

            {/* Fields */}
            <div className="divide-y divide-white/5">
              {fields.map((field) => (
                <div key={field.result_key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    field.approved ? 'bg-emerald-400' : 'bg-white/20',
                  )} />
                  <span className="text-sm text-white/50 flex-1 min-w-0 truncate">
                    {FIELD_LABELS[field.result_key] ?? field.result_key}
                  </span>
                  <ArrowRight size={11} className="text-white/15 flex-shrink-0" />
                  <span className={cn('text-xs flex-shrink-0', colorClass.split(' ')[0])}>
                    {section.split('/')[0].replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
