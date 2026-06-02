'use client'

import { useState } from 'react'
import { X, ArrowRight, RefreshCw, Sparkles, CheckSquare, Square } from 'lucide-react'
import { Transaction } from '@/lib/types'

export interface RecategorizeProposal {
  transaction: Transaction
  newCategory: string
  newSubcategory?: string
  confidence: number
}

interface RecategorizePreviewProps {
  onClose: () => void
  loading: boolean
  progress?: { done: number; total: number } | null
  proposals: RecategorizeProposal[] | null
  emojiFor: (name: string) => string
  onApply: (accepted: RecategorizeProposal[]) => void | Promise<void>
}

// Parent mounts this only while open, so component state resets naturally
// between runs — no useEffect-driven reset needed.
export default function RecategorizePreview({
  onClose,
  loading,
  progress,
  proposals,
  emojiFor,
  onApply,
}: RecategorizePreviewProps) {
  // Rejected IDs are what the user explicitly UNchecked (default = all changes
  // accepted). Unchanged proposals are not in the list to begin with.
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [filter, setFilter] = useState<'changes' | 'all'>('changes')

  const changes = (proposals || []).filter(p => p.newCategory !== p.transaction.category)
  const visible = filter === 'changes' ? changes : (proposals || [])
  const accepted = changes.filter(p => !rejected.has(p.transaction.id))

  const toggle = (id: string) => {
    setRejected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const acceptAll = () => setRejected(new Set())
  const rejectAll = () => setRejected(new Set(changes.map(p => p.transaction.id)))

  const handleApply = async () => {
    setApplying(true)
    try {
      await onApply(accepted)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={18} className="text-purple-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">AI re-categorize</h2>
              {!loading && proposals && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Reviewed {proposals.length} transaction{proposals.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-medium text-purple-700">{changes.length}</span> suggested change{changes.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            className="text-gray-400 hover:text-gray-700 rounded-lg p-2 hover:bg-gray-100 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <RefreshCw size={28} className="text-purple-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-800">AI is reviewing your transactions…</p>
            {progress && progress.total > 0 ? (
              <>
                <p className="text-xs text-gray-500 mt-1">
                  Batch <span className="font-medium text-gray-700">{progress.done}</span> of {progress.total}
                </p>
                <div className="w-64 max-w-full mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all duration-500"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">~30 seconds per batch · {progress.total * 30}s total estimate</p>
              </>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Usually 30–60 seconds.</p>
            )}
          </div>
        ) : !proposals ? (
          <div className="flex-1 flex items-center justify-center p-10 text-gray-400 text-sm">
            No proposals to show.
          </div>
        ) : changes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="text-5xl mb-3">✨</div>
            <p className="text-lg font-medium text-gray-800">Nothing to change</p>
            <p className="text-sm text-gray-500 mt-1">
              AI thinks every transaction is already in the right bucket.
            </p>
            <button
              onClick={onClose}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Filter + bulk controls */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
              <div className="flex gap-1 p-0.5 bg-gray-200 rounded-lg text-xs">
                <button
                  onClick={() => setFilter('changes')}
                  className={`px-2.5 py-1 rounded-md font-medium ${filter === 'changes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                  Changes ({changes.length})
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                  All ({proposals.length})
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={acceptAll}
                  className="text-purple-700 hover:text-purple-900 font-medium px-2 py-1"
                >
                  Accept all
                </button>
                <span className="text-gray-300">·</span>
                <button
                  onClick={rejectAll}
                  className="text-gray-500 hover:text-gray-800 font-medium px-2 py-1"
                >
                  Reject all
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {visible.map(p => {
                const t = p.transaction
                const isChange = p.newCategory !== t.category
                const isAccepted = isChange && !rejected.has(t.id)
                return (
                  <div
                    key={t.id}
                    className={`border rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors ${
                      !isChange
                        ? 'bg-gray-50 border-gray-200 opacity-70'
                        : isAccepted
                          ? 'bg-purple-50/50 border-purple-300'
                          : 'bg-white border-gray-200'
                    }`}
                  >
                    {isChange ? (
                      <button
                        onClick={() => toggle(t.id)}
                        className={`shrink-0 p-1 rounded ${isAccepted ? 'text-purple-600' : 'text-gray-300 hover:text-gray-500'}`}
                        title={isAccepted ? 'Reject this change' : 'Accept this change'}
                      >
                        {isAccepted ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    ) : (
                      <span className="w-7 shrink-0 text-center text-xs text-gray-300">—</span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <span className="text-base leading-none">{emojiFor(t.category)}</span>
                          <span className="truncate max-w-[120px]">{t.category}</span>
                        </span>
                        {isChange && (
                          <>
                            <ArrowRight size={12} className="text-purple-500 shrink-0" />
                            <span className="inline-flex items-center gap-1 text-purple-700 font-medium">
                              <span className="text-base leading-none">{emojiFor(p.newCategory)}</span>
                              <span className="truncate max-w-[140px]">{p.newCategory}</span>
                            </span>
                          </>
                        )}
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{t.date}</span>
                        {isChange && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400">AI conf {(p.confidence * 100).toFixed(0)}%</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className={`text-sm font-semibold shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {t.amount < 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-800">{accepted.length}</span> change{accepted.length === 1 ? '' : 's'} ready to apply
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={applying}
                  className="text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying || accepted.length === 0}
                  className="text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg px-4 py-2 flex items-center gap-1.5"
                >
                  {applying ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Applying…
                    </>
                  ) : (
                    <>Apply {accepted.length} change{accepted.length === 1 ? '' : 's'}</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
