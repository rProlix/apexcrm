import { ChevronDown } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

interface FieldChromeProps {
  id: string
  label: string
  hint?: string
  error?: string
  optional?: boolean
  className?: string
  controlClassName?: string
}

type TextFieldProps = FieldChromeProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>

type TextareaFieldProps = FieldChromeProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>

type SelectFieldProps = FieldChromeProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>

function FieldLabel({ id, label, optional }: Pick<FieldChromeProps, 'id' | 'label' | 'optional'>) {
  return (
    <label htmlFor={id} className="ui-label">
      {label}
      {optional && <span className="ml-1 font-normal text-white/35">Optional</span>}
    </label>
  )
}

function FieldSupport({ id, hint, error }: Pick<FieldChromeProps, 'id' | 'hint' | 'error'>) {
  if (error) {
    return (
      <p id={`${id}-error`} className="ui-error" role="alert">
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="ui-help">
        {hint}
      </p>
    )
  }
  return null
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ id, label, hint, error, optional, className, controlClassName, required, ...props }, ref) => (
    <div className={cn('space-y-2', className)}>
      <FieldLabel id={id} label={label} optional={optional} />
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        className={cn('ui-input', controlClassName)}
        {...props}
      />
      <FieldSupport id={id} hint={hint} error={error} />
    </div>
  )
)

TextField.displayName = 'TextField'

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ id, label, hint, error, optional, className, controlClassName, required, ...props }, ref) => (
    <div className={cn('space-y-2', className)}>
      <FieldLabel id={id} label={label} optional={optional} />
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        className={cn('ui-input min-h-28 resize-y', controlClassName)}
        {...props}
      />
      <FieldSupport id={id} hint={hint} error={error} />
    </div>
  )
)

TextareaField.displayName = 'TextareaField'

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    { id, label, hint, error, optional, className, controlClassName, required, children, ...props },
    ref
  ) => (
    <div className={cn('space-y-2', className)}>
      <FieldLabel id={id} label={label} optional={optional} />
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, hint, error)}
          className={cn('ui-input appearance-none pr-10', controlClassName)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
          aria-hidden="true"
        />
      </div>
      <FieldSupport id={id} hint={hint} error={error} />
    </div>
  )
)

SelectField.displayName = 'SelectField'
