'use client'

import { forwardRef } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  ghost: 'ui-button-ghost',
  danger: 'ui-button-danger',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'min-h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-6 text-base rounded-xl gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center font-medium transition duration-150',
          'focus-ring disabled:cursor-not-allowed disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <LoaderCircle
            className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
