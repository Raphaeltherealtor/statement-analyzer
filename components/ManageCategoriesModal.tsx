'use client'

import { useMemo, useState } from 'react'
import { X, ArrowRight, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import { CustomCategory } from '@/lib/types'

interface CategoryRef { name: string; emoji: string }

interface ManageCategoriesModalProps {
  onClose: () => void
  customCategories: CustomCategory[]
  // Count of transactions currently in each category (any category — built-in
  // or custom). Used to show how many txns each row would affect.
  transactionCounts: Map<string, number>
  // All categories that could be a merge target (defaults + customs).
  allCategories: CategoryRef[]
  onMerge: (source: string, target: string) => void | Promise<void>
  onDelete: (categoryName: string) => void
}

// Suggest a merge target for a custom category by looking for an existing
// category whose name overlaps in meaning. Built-ins are preferred over
// other customs as the suggested target.
function suggestTarget(customName: string, candidates: CategoryRef[], builtIns: Set<string>): string | null {
  const lower = customName.toLowerCase().trim()
  if (!lower) return null

  // 1) Exact substring match — prefer built-ins.
  const containsScore = (c: CategoryRef): number => {
    const cl = c.name.toLowerCase()
    if (cl === lower) return 100
    if (cl.includes(lower) || lower.includes(cl)) return 50 + (builtIns.has(c.name) ? 10 : 0)
    return 0
  }

  // 2) Word overlap — common significant words count.
  const customWords = new Set(lower.split(/[\s&/-]+/).filter(w => w.length > 2))
  const wordScore = (c: CategoryRef): number => {
    const cWords = c.name.toLowerCase().split(/[\s&/-]+/).filter(w => w.length > 2)
    const overlap = cWords.filter(w => customWords.has(w)).length
    return overlap > 0 ? overlap * 5 + (builtIns.has(c.name) ? 3 : 0) : 0
  }

  let best: CategoryRef | null = null
  let bestScore = 0
  for (const c of candidates) {
    if (c.name === customName) continue
    const s = Math.max(containsScore(c), wordScore(c))
    if (s > bestScore) {
      bestScore = s
      best = c
    }
  }
  return bestScore >= 5 ? (best?.name ?? null) : null
}

export default function ManageCategoriesModal({
  onClose,
  customCategories,
  transactionCounts,
  allCategories,
  onMerge,
  onDelete,
}: ManageCategoriesModalProps) {
  const [merging, setMerging] = useState<string | null>(null) // source name currently being merged
  const [pickedTargets, setPickedTargets] = useState<Record<string, string>>({})

  const builtInSet = useMemo(
    () => new Set(allCategories.map(c => c.name).filter(name => !customCategories.some(c => c.name === name))),
    [allCategories, customCategories]
  )

  // Order: custom categories sorted by transaction count desc (biggest first)
  const ordered = useMemo(() => {
    return [...customCategories]
      .map(c => ({
        ...c,
        count: transactionCounts.get(c.name) ?? 0,
        suggested: suggestTarget(c.name, allCategories.filter(x => x.name !== c.name), builtInSet),
      }))
      .sort((a, b) => b.count - a.count)
  }, [customCategories, transactionCounts, allCategories, builtInSet])

  const emojiFor = (name: string) =>
    allCategories.find(c => c.name === name)?.emoji ?? '📌'

  const handleMerge = async (source: string) => {
    const target = pickedTargets[source]
    if (!target || target === source) return
    setMerging(source)
    try {
      await onMerge(source, target)
    } finally {
      setMerging(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage custom categories</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Merge custom categories into existing ones, or delete empty ones. Merging moves every transaction (and any merchant rules) into the target.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 rounded-lg p-2 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {ordered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="text-5xl mb-3">🧼</div>
            <p className="text-lg font-medium text-gray-800">No custom categories</p>
            <p className="text-sm text-gray-500 mt-1">
              All your transactions live in the built-in buckets. Nothing to merge.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {ordered.map(cat => {
              const isMerging = merging === cat.name
              const target = pickedTargets[cat.name] ?? cat.suggested ?? ''
              const targetIsValid = target && target !== cat.name
              const isEmpty = cat.count === 0
              const suggestedIsBuiltIn = cat.suggested && builtInSet.has(cat.suggested)

              return (
                <div
                  key={cat.name}
                  className={`border rounded-xl p-3 ${
                    cat.suggested && !isEmpty
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{cat.name}</p>
                      <p className="text-xs text-gray-500">
                        {cat.count} transaction{cat.count === 1 ? '' : 's'}
                        {suggestedIsBuiltIn && (
                          <span className="text-amber-700 ml-2 font-medium">
                            · looks like a duplicate of a built-in
                          </span>
                        )}
                      </p>
                    </div>
                    {isEmpty ? (
                      <button
                        onClick={() => onDelete(cat.name)}
                        className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-300 rounded-md px-2 py-1.5"
                      >
                        <Trash2 size={12} />
                        Delete (empty)
                      </button>
                    ) : null}
                  </div>

                  {!isEmpty && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">Merge into</span>
                      <ArrowRight size={12} className="text-gray-400 shrink-0" />
                      <select
                        value={target}
                        onChange={e => setPickedTargets(prev => ({ ...prev, [cat.name]: e.target.value }))}
                        disabled={isMerging}
                        className="text-xs font-medium border rounded px-2 py-1.5 max-w-[220px] focus:outline-none focus:ring-2 focus:ring-amber-400 border-gray-200"
                      >
                        <option value="">— pick a target —</option>
                        {allCategories
                          .filter(c => c.name !== cat.name)
                          .map(c => (
                            <option key={c.name} value={c.name}>
                              {c.emoji} {c.name}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleMerge(cat.name)}
                        disabled={!targetIsValid || isMerging}
                        className="flex items-center gap-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-md px-3 py-1.5"
                      >
                        {isMerging ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            Merging…
                          </>
                        ) : (
                          <>
                            Move {cat.count} txn{cat.count === 1 ? '' : 's'}
                          </>
                        )}
                      </button>
                      {targetIsValid && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <span>{emojiFor(target)}</span>
                          <span className="truncate max-w-[120px]">{target}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <p className="text-xs text-gray-400 px-2 pt-2 flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Merging is permanent for this session — it updates every loaded transaction and saves to your Supabase row. Use the dashboard pencil to undo individual transactions if needed.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-4 py-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
