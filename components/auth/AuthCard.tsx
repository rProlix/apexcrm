import { cn } from '@/lib/utils'

interface AuthCardProps {
  children:   React.ReactNode
  className?: string
}

/**
 * Centered full-viewport wrapper used by /login and /signup.
 * Renders the dark-graphite background with vertical centering.
 */
export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <main className="min-h-dvh bg-graphite-950 flex items-center justify-center px-4 py-12">
      <div className={cn('w-full max-w-md animate-fade-in', className)}>
        {children}
      </div>
    </main>
  )
}
