'use client'
// components/product-360/Product360ViewerErrorBoundary.tsx
//
// React class error boundary for the 360° viewer.
// Prevents a crashed Three.js renderer from taking down the whole page.
// Falls back to the lightweight sequence preview if frame URLs are available.

import { Component, type ReactNode } from 'react'
import Product360SequencePreview from './Product360SequencePreview'

interface Props {
  children:     ReactNode
  frameUrls?:   string[]
  productName?: string
  className?:   string
}

interface State {
  hasError:     boolean
  errorMessage: string
}

export class Product360ViewerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError:     true,
      errorMessage: error instanceof Error ? error.message : 'Unknown viewer error',
    }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    console.warn(
      '[360-viewer] Error boundary caught — falling back to sequence preview.',
      error instanceof Error ? error.message : error,
      info?.componentStack?.slice(0, 200),
    )
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { frameUrls = [], productName, className = '' } = this.props

    return (
      <div className={`space-y-2 ${className}`}>
        <div className="text-[10px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">
          Interactive preview unavailable on this device — showing safe preview mode.
        </div>
        {frameUrls.length > 0 ? (
          <Product360SequencePreview
            frameUrls={frameUrls}
            productName={productName}
            autoSpin
          />
        ) : (
          <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
            <p className="text-xs text-white/30">Preview unavailable</p>
          </div>
        )}
      </div>
    )
  }
}

export default Product360ViewerErrorBoundary
