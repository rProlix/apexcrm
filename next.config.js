const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  reactStrictMode: true,

  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: '**.vercel.app' },
      // Allow any https image (user-uploaded content from arbitrary CDNs)
      { protocol: 'https', hostname: '**' },
    ],
    // Serve modern formats — Vercel handles conversion at the edge
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },

  // Keep Supabase SSR server-side only — reduces client bundle size
  serverExternalPackages: ['@supabase/ssr'],

  // Bundler-only alias for the heavy React-Three-Fiber scene. This file is
  // excluded from the app TypeScript program (see tsconfig "exclude") so R3F's
  // global JSX augmentation cannot poison the rest of the app's types. The
  // bundler still resolves and ships the real component at runtime.
  // Mirrored for Turbopack (`next dev --turbopack`).
  turbopack: {
    resolveAlias: {
      '@three-hero/ThreeScrollScene': './components/website/3d/ThreeScrollScene.tsx',
    },
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@three-hero': path.resolve(__dirname, 'components/website/3d'),
    }
    return config
  },

  // Warnings are not build-blockers; errors already fail the build cleanly.
  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',       value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Long-lived cache for immutable static assets
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
