'use client'

import { AlertTriangle } from 'lucide-react'

interface ReviewBannerProps {
  count: number
  onOpen: () => void
}

export default function ReviewBanner({ count, onOpen }: ReviewBannerProps) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={18} className="text-amber-600 shrink-0" />
        <p className="text-sm text-amber-900">
          <span className="font-semibold">{count}</span> transaction{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} a category
        </p>
      </div>
      <button
        onClick={onOpen}
        className="text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg shrink-0"
      >
        Review
      </button>
    </div>
  )
}
