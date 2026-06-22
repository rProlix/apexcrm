'use client'

// components/website/3d/ScrollHeroErrorBoundary.tsx
// Catches any render/runtime error from the interactive 3D/video scene and
// renders a safe fallback (image or premium gradient) instead of crashing the
// whole page. WebGL/video failures must never take down a public website.

import React from 'react'

interface Props {
  children:  React.ReactNode
  fallback:  React.ReactNode
  onError?:  (error: Error) => void
}

interface State {
  hasError: boolean
}

export class ScrollHeroErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Log for diagnostics; never rethrow.
    console.error('[Premium3DScrollHero] scene error:', error?.message, error?.stack)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>
    return <>{this.props.children}</>
  }
}
