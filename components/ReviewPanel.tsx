'use client'

import { useMemo, useState } from 'react'
import { X, Plus, Check, SkipForward, Undo2 } from 'lucide-react'
import { Transaction, CustomCategory } from '@/lib/types'

interface ReviewPanelProps {
  open: boolean
  onClose: () => void
  queue: Transaction[]
  knownCategories: { name: string; emoji: string }[]
  onAssign: (transactionId: string, category: string, persistRule: boolean) => void
  onCreateCategory: (cat: CustomCategory) => void
  // Single-transaction edit mode: panel shows one txn, auto-closes after
  // assign, hides the queue/skip UI, defaults persistRule off (since one
  // ad-hoc move usually shouldn't create a global rule).
  singleMode?: boolean
}

const QUICK_EMOJIS = ['📌', '🏷️', '💵', '🛍️', '🍽️', '🚗', '🏠', '🎁', '💼', '✈️', '🎉', '⚡']

export default function ReviewPanel({
  open,
  onClose,
  queue,
  knownCategories,
  onAssign,
  onCreateCategory,
  singleMode = false,
}: ReviewPanelProps) {
  const [persistRule, setPersistRule] = useState(!singleMode)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('📌')
  const [filter, setFilter] = useState('')
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())

  const visible = useMemo(
    () => queue.filter(t => !skippedIds.has(t.id)),
    [queue, skippedIds]
  )
  const current = visible[0]

  const filteredCategories = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return knownCategories
    return knownCategories.filter(c => c.name.toLowerCase().includes(f))
  }, [filter, knownCategories])

  if (!open) return null

  const resetPickerForm = () => {
    setFilter('')
    setShowNewForm(false)
    setNewName('')
    setNewEmoji('📌')
  }

  const handlePick = (categoryName: string) => {
    if (!current) return
    onAssign(current.id, categoryName, persistRule)
    resetPickerForm()
    if (singleMode) onClose()
  }

  const handleCreateAndPick = () => {
    const name = newName.trim()
    if (!name) return
    onCreateCategory({ name, emoji: newEmoji || '📌' })
    handlePick(name)
  }

  const handleSkip = () => {
    if (!current) return
    setSkippedIds(prev => {
      const next = new Set(prev)
      next.add(current.id)
      return next
    })
    resetPickerForm()
  }

  const handleUnskip = () => setSkippedIds(new Set())

  const skippedCount = skippedIds.size

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {singleMode ? 'Move to another category' : 'Categorize transactions'}
            </h2>
            {!singleMode && (
              <p className="text-xs text-gray-500 mt-0.5">
                {visible.length > 0
                  ? `${visible.length} left to categorize${skippedCount ? ` · ${skippedCount} skipped` : ''}`
                  : skippedCount > 0
                    ? `${skippedCount} skipped`
                    : 'All caught up'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 rounded-lg p-2 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {!current ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-lg font-medium text-gray-800">
              {skippedCount > 0 ? 'Only skipped items remain' : 'Everything is categorized'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {skippedCount > 0
                ? 'Bring them back to review them.'
                : 'Nothing else needs review.'}
            </p>
            <div className="flex gap-2 mt-6">
              {skippedCount > 0 && (
                <button
                  onClick={handleUnskip}
                  className="flex items-center gap-1 text-sm border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg"
                >
                  <Undo2 size={14} />
                  Bring back {skippedCount} skipped
                </button>
              )}
              <button
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Transaction summary */}
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 break-words">{current.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                    <span>{current.date}</span>
                    <span className="text-gray-300">·</span>
                    <span>{current.source}</span>
                    {typeof current.confidence === 'number' && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>AI confidence: {(current.confidence * 100).toFixed(0)}%</span>
                      </>
                    )}
                    {current.category && current.category !== 'Uncategorized' && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>AI guess: <span className="text-gray-700">{current.category}</span></span>
                      </>
                    )}
                  </div>
                </div>
                <p className={`text-xl font-bold shrink-0 ${current.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                  {current.amount < 0 ? '+' : ''}${Math.abs(current.amount).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Picker */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Search categories…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setShowNewForm(s => !s)}
                  className={`flex items-center gap-1 text-sm font-medium border rounded-lg px-3 py-2 transition-colors ${
                    showNewForm
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  <Plus size={14} />
                  New
                </button>
              </div>

              {showNewForm && (
                <div className="mb-4 p-3 border border-blue-200 bg-blue-50 rounded-xl">
                  <p className="text-xs font-medium text-gray-700 mb-2">Create a custom category</p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Emoji"
                      value={newEmoji}
                      onChange={e => setNewEmoji(e.target.value.slice(0, 4))}
                      className="w-16 text-center text-lg border border-gray-200 rounded-lg px-2 py-2 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="e.g. Side Hustle Income"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateAndPick()}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateAndPick}
                      disabled={!newName.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1"
                    >
                      <Check size={14} />
                      Use
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setNewEmoji(e)}
                        className={`text-lg w-8 h-8 rounded-md hover:bg-white ${newEmoji === e ? 'bg-white border border-blue-400' : ''}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredCategories.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => handlePick(cat.name)}
                    className="flex items-center gap-2 text-left text-sm border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <span className="text-lg shrink-0">{cat.emoji}</span>
                    <span className="text-gray-800 truncate">{cat.name}</span>
                  </button>
                ))}
              </div>

              {filteredCategories.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">
                  No categories match — try creating a new one.
                </p>
              )}
            </div>

            {/* Footer controls */}
            <div className="border-t border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={persistRule}
                  onChange={e => setPersistRule(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Remember <span className="font-medium">{current.subcategory || current.description}</span> for next time
              </label>
              {!singleMode && (
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5"
                >
                  <SkipForward size={14} />
                  Skip for now
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
