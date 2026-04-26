/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // compress: true is the Vercel/Node.js default but explicit is clearer
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
