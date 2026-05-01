'use client'

// components/builder/editors/FormFields.tsx
// Shared form primitive components used by all section editors

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display:      'block',
        fontSize:     '0.75rem',
        fontWeight:   600,
        color:        '#71717a',
        marginBottom: '0.375rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function Textarea({
  value, onChange, rows = 3, placeholder,
}: {
  value:       string
  onChange:    (v: string) => void
  rows?:       number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{
        width:        '100%',
        padding:      '0.5rem 0.75rem',
        background:   '#18181b',
        border:       '1px solid #3f3f46',
        borderRadius: '0.5rem',
        color:        '#f4f4f5',
        fontSize:     '0.875rem',
        outline:      'none',
        resize:       'vertical',
        boxSizing:    'border-box',
        lineHeight:   1.5,
      }}
    />
  )
}

export function Select({
  value, onChange, options,
}: {
  value:    string
  onChange: (v: string) => void
  options:  { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width:        '100%',
        padding:      '0.5rem 0.75rem',
        background:   '#18181b',
        border:       '1px solid #3f3f46',
        borderRadius: '0.5rem',
        color:        '#f4f4f5',
        fontSize:     '0.875rem',
        outline:      'none',
        cursor:       'pointer',
        boxSizing:    'border-box',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({
  label, value, onChange,
}: {
  label:    string
  value:    boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}
    >
      <span style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width:        40,
          height:       22,
          borderRadius: '99px',
          background:   value ? '#c9a84c' : '#3f3f46',
          border:       'none',
          cursor:       'pointer',
          position:     'relative',
          transition:   'background 0.2s',
          padding:      0,
        }}
      >
        <span
          style={{
            position:   'absolute',
            top:        3,
            left:       value ? 21 : 3,
            width:      16,
            height:     16,
            borderRadius: '50%',
            background:   '#fff',
            transition:   'left 0.2s',
          }}
        />
      </button>
    </div>
  )
}

export const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '0.5rem 0.75rem',
  background:   '#18181b',
  border:       '1px solid #3f3f46',
  borderRadius: '0.5rem',
  color:        '#f4f4f5',
  fontSize:     '0.875rem',
  outline:      'none',
  boxSizing:    'border-box',
}
