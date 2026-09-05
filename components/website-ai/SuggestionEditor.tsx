'use client'

// Edits the content that will actually be applied to the website. Design data
// remains intact and hidden so a copy edit cannot accidentally corrupt styling.

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface EditableSuggestion {
  id: string
  suggestion_type: string
  title: string | null
  admin_notes: string | null
  proposed_section: Record<string, unknown>
  extracted_data: Record<string, unknown>
}

interface Props {
  suggestion: EditableSuggestion
  onSave: (updates: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

interface FieldSpec {
  key: string
  label: string
  multiline?: boolean
}

const FIELDS_BY_TYPE: Record<string, FieldSpec[]> = {
  hero: [
    { key: 'headline', label: 'Headline' },
    { key: 'subheadline', label: 'Supporting text', multiline: true },
    { key: 'ctaLabel', label: 'Button label' },
    { key: 'ctaHref', label: 'Button link' },
  ],
  about: [
    { key: 'heading', label: 'Heading' },
    { key: 'body', label: 'About copy', multiline: true },
  ],
  services: [
    { key: 'heading', label: 'Heading' },
    { key: 'subheading', label: 'Supporting text', multiline: true },
  ],
  products: [
    { key: 'heading', label: 'Heading' },
    { key: 'subheading', label: 'Supporting text', multiline: true },
  ],
  menu: [
    { key: 'heading', label: 'Heading' },
    { key: 'subheading', label: 'Supporting text', multiline: true },
  ],
  reviews: [{ key: 'heading', label: 'Heading' }],
  testimonials: [{ key: 'heading', label: 'Heading' }],
  faq: [{ key: 'heading', label: 'Heading' }],
  contact: [
    { key: 'heading', label: 'Heading' },
    { key: 'body', label: 'Supporting text', multiline: true },
  ],
  hours: [
    { key: 'heading', label: 'Heading' },
    { key: 'body', label: 'Supporting text', multiline: true },
  ],
  promotion: [
    { key: 'text', label: 'Promotion text', multiline: true },
    { key: 'ctaLabel', label: 'Button label' },
    { key: 'ctaHref', label: 'Button link' },
  ],
  cta: [
    { key: 'headline', label: 'Headline' },
    { key: 'body', label: 'Supporting text', multiline: true },
    { key: 'ctaLabel', label: 'Button label' },
    { key: 'ctaHref', label: 'Button link' },
  ],
}

const ITEM_FIELDS: Record<string, FieldSpec[]> = {
  services: [
    { key: 'name', label: 'Service' },
    { key: 'price', label: 'Price' },
    { key: 'description', label: 'Description', multiline: true },
  ],
  products: [
    { key: 'name', label: 'Product' },
    { key: 'price', label: 'Price' },
    { key: 'description', label: 'Description', multiline: true },
  ],
  menu: [
    { key: 'name', label: 'Item' },
    { key: 'price', label: 'Price' },
    { key: 'description', label: 'Description', multiline: true },
  ],
  reviews: [
    { key: 'name', label: 'Reviewer' },
    { key: 'role', label: 'Role or source' },
    { key: 'text', label: 'Review', multiline: true },
  ],
  testimonials: [
    { key: 'name', label: 'Reviewer' },
    { key: 'role', label: 'Role or source' },
    { key: 'text', label: 'Review', multiline: true },
  ],
  faq: [
    { key: 'question', label: 'Question' },
    { key: 'answer', label: 'Answer', multiline: true },
  ],
}

const CONTACT_FIELDS: FieldSpec[] = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
]

const SEO_FIELDS: FieldSpec[] = [
  { key: 'title', label: 'Search title' },
  { key: 'description', label: 'Search description', multiline: true },
  { key: 'keywords', label: 'Keywords' },
]

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ')
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

export function SuggestionEditor({ suggestion, onSave, onClose }: Props) {
  const [title, setTitle] = useState(suggestion.title ?? '')
  const [adminNotes, setAdminNotes] = useState(suggestion.admin_notes ?? '')
  const [proposedSection, setProposedSection] = useState<Record<string, unknown>>(
    toRecord(suggestion.proposed_section)
  )
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>(
    toRecord(suggestion.extracted_data)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const type = suggestion.suggestion_type
  const topFields = FIELDS_BY_TYPE[type] ?? [
    { key: 'heading', label: 'Heading' },
    { key: 'body', label: 'Body', multiline: true },
  ]
  const arrayKey =
    type === 'services' ? 'services' : type === 'products' || type === 'menu' ? 'products' : 'items'
  const itemsFromExtracted = type === 'services' || type === 'products' || type === 'menu'
  const itemSource = itemsFromExtracted ? extractedData : proposedSection
  const items = Array.isArray(itemSource[arrayKey])
    ? (itemSource[arrayKey] as unknown[]).map(toRecord)
    : []
  const itemFields = ITEM_FIELDS[type] ?? []
  const dataFields =
    type === 'seo' ? SEO_FIELDS : type === 'contact' || type === 'hours' ? CONTACT_FIELDS : []

  function updateItem(index: number, key: string, value: string) {
    const nextItems = items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [key]: value } : item
    )
    if (itemsFromExtracted) {
      setExtractedData((current) => ({ ...current, [arrayKey]: nextItems }))
    } else {
      setProposedSection((current) => ({ ...current, [arrayKey]: nextItems }))
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title,
        admin_notes: adminNotes,
        status: 'edited',
        proposed_section: proposedSection,
        extracted_data: extractedData,
      })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this edit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-graphite-700/50 border border-white/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white/70">Edit website content</p>
          <p className="text-2xs text-white/35 mt-0.5">These values are applied to the section.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="text-white/30 hover:text-white/70 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <EditorField label="Suggestion name" value={title} onChange={setTitle} />

      {topFields.map((field) => (
        <EditorField
          key={field.key}
          label={field.label}
          value={stringValue(proposedSection[field.key])}
          multiline={field.multiline}
          onChange={(value) =>
            setProposedSection((current) => ({ ...current, [field.key]: value }))
          }
        />
      ))}

      {dataFields.map((field) => (
        <EditorField
          key={field.key}
          label={field.label}
          value={stringValue(extractedData[field.key])}
          multiline={field.multiline}
          onChange={(value) =>
            setExtractedData((current) => ({
              ...current,
              [field.key]:
                field.key === 'keywords'
                  ? value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : value,
            }))
          }
        />
      ))}

      {items.length > 0 && itemFields.length > 0 && (
        <div className="space-y-3">
          <p className="text-2xs font-semibold text-white/45 uppercase tracking-wide">
            {type === 'faq'
              ? 'Questions'
              : type === 'services'
                ? 'Services'
                : type === 'products' || type === 'menu'
                  ? 'Items'
                  : 'Reviews'}
          </p>
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-white/8 bg-graphite-800/50 p-3 space-y-3"
            >
              {itemFields.map((field) => (
                <EditorField
                  key={field.key}
                  label={`${field.label} ${index + 1}`}
                  value={stringValue(item[field.key] ?? (field.key === 'text' ? item.quote : ''))}
                  multiline={field.multiline}
                  onChange={(value) => updateItem(index, field.key, value)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <EditorField
        label="Private note"
        value={adminNotes}
        multiline
        placeholder="Optional note for your team"
        onChange={setAdminNotes}
      />

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/70 px-3 py-1.5 transition-colors"
        >
          Cancel
        </button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <Save className="h-3.5 w-3.5" />
          Save content
        </Button>
      </div>
    </div>
  )
}

function EditorField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const className =
    'w-full bg-graphite-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30'
  return (
    <label className="block space-y-1.5">
      <span className="text-2xs text-white/50 font-medium">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder={placeholder}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </label>
  )
}
