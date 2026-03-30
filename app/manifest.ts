import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Statement Analyzer',
    short_name: 'Statements',
    description: 'Upload bank statements and analyze spending by category for taxes',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#22c55e',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
