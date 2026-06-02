'use client'

import { useMemo, useState } from 'react'
import {
  X,
  ArrowRight,
  RefreshCw,
  Sparkles,
  CheckSquare,
  Square,
  MinusSquare,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'
import { Transaction } from '@/lib/types'
import { normalizeMerchant } from '@/lib/normalize'

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
  knownCategories: { name: string; emoji: string }[]
  emojiFor: (name: string) => string
  onApply: (accepted: RecategorizeProposal[]) => void | Promise<void>
}

interface ProposalGroup {
  key: string
  merchantLabel: string
  proposals: RecategorizeProposal[]
  dominantAi: string
  hasMixedAi: boolean
  hasMixedCurrent: boolean
  uniformCurrent: string | null
  totalAbsAmount: number
  avgConfidence: number
}

export default function RecategorizePreview({
  onClose,
  loading,
  progress,
  proposals,
  knownCategories,
  emojiFor,
  onApply,
}: RecategorizePreviewProps) {
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [groupOverrides, setGroupOverrides] = useState<Map<string, string>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [filter, setFilter] = useState<'changes' | 'all'>('changes')

  // Group by normalized merchant — so 47 Amazon rows collapse into one row
  // the user can accept, override, or cherry-pick inside.
  const groups = useMemo<ProposalGroup[]>(() => {
    const input = proposals || []
    const map = new Map<string, RecategorizeProposal[]>()
    for (const p of input) {
      const key = normalizeMerchant(p.transaction.description) || `unk:${p.transaction.id}`
      const list = map.get(key) || []
      list.push(p)
      map.set(key, list)
    }

    return Array.from(map.entries())
      .map(([key, list]) => {
        const aiCounts = new Map<string, number>()
        const currentSet = new Set<string>()
        list.forEach(p => {
          aiCounts.set(p.newCategory, (aiCounts.get(p.newCategory) || 0) + 1)
          currentSet.add(p.transaction.category)
        })
        const sortedAi = Array.from(aiCounts.entries()).sort((a, b) => b[1] - a[1])
        const merchantLabel = list[0].transaction.subcategory || list[0].transaction.description
        return {
          key,
          merchantLabel,
          proposals: list.sort((a, b) => (b.transaction.date || '').localeCompare(a.transaction.date || '')),
          dominantAi: sortedAi[0][0],
          hasMixedAi: sortedAi.length > 1,
          hasMixedCurrent: currentSet.size > 1,
          uniformCurrent: currentSet.size === 1 ? Array.from(currentSet)[0] : null,
          totalAbsAmount: list.reduce((s, p) => s + Math.abs(p.transaction.amount), 0),
          avgConfidence: list.reduce((s, p) => s + p.confidence, 0) / list.length,
        }
      })
      .sort((a, b) => b.totalAbsAmount - a.totalAbsAmount)
  }, [proposals])

  // Effective destination for a single proposal given the group's override
  // (group override beats AI; if no override, fall back to per-row AI pick).
  const effectiveCategory = (g: ProposalGroup, p: RecategorizeProposal): string => {
    return groupOverrides.get(g.key) ?? p.newCategory
  }

  // Does this row actually represent a category change (after overrides)?
  const rowIsChange = (g: ProposalGroup, p: RecategorizeProposal): boolean =>
    effectiveCategory(g, p) !== p.transaction.category

  const groupHasAnyChange = (g: ProposalGroup): boolean =>
    g.proposals.some(p => rowIsChange(g, p))

  // ── Bulk helpers ──────────────────────────────────────────────────────
  const setRowRejected = (id: string, reject: boolean) => {
    setRejected(prev => {
      const next = new Set(prev)
      if (reject) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleRow = (id: string) => setRowRejected(id, !rejected.has(id))

  const toggleGroup = (g: ProposalGroup) => {
    // Indeterminate or all-included → reject all; all-rejected → re-include all
    const acceptedCount = g.proposals.filter(p => !rejected.has(p.transaction.id)).length
    setRejected(prev => {
      const next = new Set(prev)
      if (acceptedCount > 0) {
        // Reject every member
        g.proposals.forEach(p => next.add(p.transaction.id))
      } else {
        // Accept every member
        g.proposals.forEach(p => next.delete(p.transaction.id))
      }
      return next
    })
  }

  const setGroupOverride = (g: ProposalGroup, category: string) => {
    setGroupOverrides(prev => {
      const next = new Map(prev)
      next.set(g.key, category)
      return next
    })
    // Picking a destination implicitly re-includes any rejected rows in the
    // group — the act of selecting IS the intent to apply.
    setRejected(prev => {
      let mutated = false
      const next = new Set(prev)
      for (const p of g.proposals) {
        if (next.delete(p.transaction.id)) mutated = true
      }
      return mutated ? next : prev
    })
  }

  const clearGroupOverride = (g: ProposalGroup) => {
    setGroupOverrides(prev => {
      if (!prev.has(g.key)) return prev
      const next = new Map(prev)
      next.delete(g.key)
      return next
    })
  }

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const acceptAll = () => setRejected(new Set())
  const rejectAll = () => {
    const ids = new Set<string>()
    groups.forEach(g => g.proposals.forEach(p => {
      if (rowIsChange(g, p)) ids.add(p.transaction.id)
    }))
    setRejected(ids)
  }

  // ── Counts ────────────────────────────────────────────────────────────
  const changeGroups = groups.filter(groupHasAnyChange)
  const visibleGroups = filter === 'changes' ? changeGroups : groups
  const acceptedRowCount = groups.reduce((sum, g) => {
    return sum + g.proposals.filter(p => rowIsChange(g, p) && !rejected.has(p.transaction.id)).length
  }, 0)
  const overrideCount = groupOverrides.size

  const handleApply = async () => {
    setApplying(true)
    try {
      const finalAccepted: RecategorizeProposal[] = []
      for (const g of groups) {
        for (const p of g.proposals) {
          if (!rowIsChange(g, p)) continue
          if (rejected.has(p.transaction.id)) continue
          finalAccepted.push({ ...p, newCategory: effectiveCategory(g, p) })
        }
      }
      await onApply(finalAccepted)
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
                  <span className="font-medium text-purple-700">{groups.length}</span> merchant{groups.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-medium text-purple-700">{changeGroups.length}</span> with changes
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
        ) : groups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-10 text-gray-400 text-sm">
            No transactions to review.
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
                  Changes ({changeGroups.length})
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                >
                  All ({groups.length})
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

            {/* Group list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {visibleGroups.map(g => {
                const acceptedInGroup = g.proposals.filter(p => !rejected.has(p.transaction.id)).length
                const allRejected = acceptedInGroup === 0
                const allAccepted = acceptedInGroup === g.proposals.length
                const indeterminate = !allAccepted && !allRejected

                const isOverridden = groupOverrides.has(g.key)
                const effectiveGroupCat = groupOverrides.get(g.key) ?? g.dominantAi
                const isChange = groupHasAnyChange(g)
                const isExpanded = expanded.has(g.key)
                const isMulti = g.proposals.length > 1

                const ChkIcon = allAccepted ? CheckSquare : indeterminate ? MinusSquare : Square

                return (
                  <div
                    key={g.key}
                    className={`border rounded-xl transition-colors ${
                      !isChange
                        ? 'bg-gray-50 border-gray-200 opacity-70'
                        : allRejected
                          ? 'bg-white border-gray-200'
                          : isOverridden
                            ? 'bg-amber-50/60 border-amber-300'
                            : 'bg-purple-50/40 border-purple-300'
                    }`}
                  >
                    {/* Group header row */}
                    <div className="px-3 py-2.5 flex items-center gap-3">
                      {isChange ? (
                        <button
                          onClick={() => toggleGroup(g)}
                          className={`shrink-0 p-1 rounded ${
                            allAccepted
                              ? isOverridden ? 'text-amber-600' : 'text-purple-600'
                              : indeterminate
                                ? 'text-purple-500'
                                : 'text-gray-300 hover:text-gray-500'
                          }`}
                          title={allAccepted ? 'Skip all in this group' : 'Include all in this group'}
                        >
                          <ChkIcon size={18} />
                        </button>
                      ) : (
                        <span className="w-7 shrink-0 text-center text-xs text-gray-300">—</span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 truncate max-w-[200px]" title={g.merchantLabel}>
                            {g.merchantLabel}
                          </p>
                          <span className="text-xs text-gray-500">
                            ({g.proposals.length} txn{g.proposals.length === 1 ? '' : 's'})
                          </span>
                          {indeterminate && (
                            <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                              {acceptedInGroup}/{g.proposals.length} selected
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <span className="text-base leading-none">
                              {g.uniformCurrent ? emojiFor(g.uniformCurrent) : '🔀'}
                            </span>
                            <span className="truncate max-w-[100px]">
                              {g.uniformCurrent ?? 'Various'}
                            </span>
                          </span>
                          <ArrowRight size={12} className={`shrink-0 ${isOverridden ? 'text-amber-500' : 'text-purple-500'}`} />
                          <select
                            value={effectiveGroupCat}
                            onChange={e => {
                              const value = e.target.value
                              if (value === g.dominantAi && !g.hasMixedAi) clearGroupOverride(g)
                              else setGroupOverride(g, value)
                            }}
                            className={`text-xs font-medium border rounded px-1.5 py-1 max-w-[170px] focus:outline-none focus:ring-2 ${
                              isOverridden
                                ? 'text-amber-700 bg-amber-50 border-amber-300 focus:ring-amber-400'
                                : 'text-purple-700 bg-purple-50 border-purple-200 focus:ring-purple-400'
                            }`}
                            title="Set destination for all members of this group"
                          >
                            {knownCategories.map(c => (
                              <option key={c.name} value={c.name}>
                                {c.emoji} {c.name}
                              </option>
                            ))}
                          </select>
                          {isOverridden && (
                            <button
                              onClick={() => clearGroupOverride(g)}
                              className="text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5"
                              title={`Revert to AI suggestion (${g.dominantAi})`}
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                          {g.hasMixedAi && !isOverridden && (
                            <span className="text-amber-600 italic">AI picks varied — override to unify</span>
                          )}
                          {isOverridden && (
                            <span className="text-amber-700 font-medium">your pick</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-semibold ${g.proposals[0].transaction.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                          ${g.totalAbsAmount.toFixed(2)}
                        </span>
                        {isMulti && (
                          <button
                            onClick={() => toggleExpanded(g.key)}
                            className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                            title={isExpanded ? 'Collapse' : 'Expand to pick individual transactions'}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded children */}
                    {isMulti && isExpanded && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-72 overflow-y-auto bg-white/60">
                        {g.proposals.map(p => {
                          const t = p.transaction
                          const isRejected = rejected.has(t.id)
                          const rowChange = rowIsChange(g, p)
                          return (
                            <div
                              key={t.id}
                              className={`px-3 py-1.5 pl-12 flex items-center gap-3 text-xs ${
                                isRejected ? 'opacity-50' : ''
                              }`}
                            >
                              <button
                                onClick={() => toggleRow(t.id)}
                                disabled={!rowChange}
                                className={`shrink-0 p-0.5 rounded ${
                                  !rowChange
                                    ? 'text-gray-200 cursor-not-allowed'
                                    : !isRejected
                                      ? isOverridden ? 'text-amber-600' : 'text-purple-600'
                                      : 'text-gray-300 hover:text-gray-500'
                                }`}
                                title={rowChange ? (isRejected ? 'Include this one' : 'Skip this one') : 'Already in target category'}
                              >
                                {!isRejected && rowChange ? <CheckSquare size={14} /> : <Square size={14} />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-gray-800 truncate">{t.description}</p>
                                <div className="flex gap-2 text-gray-400">
                                  <span>{t.date}</span>
                                  {!isOverridden && g.hasMixedAi && (
                                    <>
                                      <span>·</span>
                                      <span className="text-purple-500">AI: {p.newCategory}</span>
                                    </>
                                  )}
                                  {!rowChange && (
                                    <>
                                      <span>·</span>
                                      <span>Already in target</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span className={`font-medium shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                                {t.amount < 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-800">{acceptedRowCount}</span> change{acceptedRowCount === 1 ? '' : 's'} ready
                {overrideCount > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-amber-700">{overrideCount}</span> group{overrideCount === 1 ? '' : 's'} overridden
                  </>
                )}
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
                  disabled={applying || acceptedRowCount === 0}
                  className="text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg px-4 py-2 flex items-center gap-1.5"
                >
                  {applying ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Applying…
                    </>
                  ) : (
                    <>Apply {acceptedRowCount} change{acceptedRowCount === 1 ? '' : 's'}</>
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
