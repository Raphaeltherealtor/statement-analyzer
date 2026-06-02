'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  RefreshCw,
  Download,
  TrendingDown,
  TrendingUp,
  BarChart3,
  FlagTriangleRight,
  X,
  History,
  Search,
  Pencil,
  CheckSquare,
  Square,
  ListChecks,
} from 'lucide-react'
import UploadZone from '@/components/UploadZone'
import CategoryCard from '@/components/CategoryCard'
import ReviewPanel from '@/components/ReviewPanel'
import ReviewBanner from '@/components/ReviewBanner'
import {
  Transaction,
  Category,
  CustomCategory,
  MerchantRule,
  DEFAULT_CATEGORY_EMOJIS,
  DEFAULT_CATEGORIES,
  POTENTIALLY_DEDUCTIBLE,
  TAX_LINE,
} from '@/lib/types'
import { normalizeMerchant } from '@/lib/normalize'
import {
  loadCustomCategories,
  saveCustomCategories,
  loadMerchantRules,
  saveMerchantRules,
  loadActiveJobs,
  saveActiveJobs,
  ActiveJob,
} from '@/lib/storage'

const CONFIDENCE_THRESHOLD = 0.7
const POLL_INTERVAL_MS = 3000

interface CompletedJob {
  id: string
  fileNames: string[]
  completedAt: number
  transactions: Transaction[]
  errors: { file: string; error: string }[]
}

// Pulled out of the component so effects can call it without dependency churn.
function applyRules(incoming: Transaction[], rules: MerchantRule[]): Transaction[] {
  const ruleMap = new Map(rules.map(r => [r.normalizedMerchant, r.category]))
  return incoming.map(t => {
    const key = normalizeMerchant(t.description)
    const ruleCategory = key ? ruleMap.get(key) : undefined
    if (ruleCategory) {
      return { ...t, category: ruleCategory, needsReview: false, confidence: 1 }
    }
    const isUncertain =
      t.category === 'Uncategorized' ||
      (typeof t.confidence === 'number' && t.confidence < CONFIDENCE_THRESHOLD)
    return { ...t, needsReview: isUncertain }
  })
}

export default function Home() {
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [errors, setErrors] = useState<{ file: string; error: string }[]>([])
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'expenses' | 'income'>('expenses')

  // Tax export mode: when on, user gets checkboxes to curate exactly which
  // transactions go into the tax CSV. Defaults to all selected on entry.
  const [taxExportMode, setTaxExportMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resumed, setResumed] = useState(false)

  const isProcessing = submitting || activeJobs.length > 0

  // Mount: hydrate prefs + load past completed jobs + resume any in-flight jobs.
  useEffect(() => {
    queueMicrotask(async () => {
      const customs = loadCustomCategories()
      const rules = loadMerchantRules()
      const active = loadActiveJobs()
      setCustomCategories(customs)
      setMerchantRules(rules)
      if (active.length > 0) {
        setActiveJobs(active)
        setResumed(true)
      }

      try {
        const res = await fetch('/api/parse/jobs')
        if (!res.ok) return
        const data = await res.json()
        const jobs: CompletedJob[] = ((data.jobs as Array<{
          id: string
          fileNames: string[]
          completedAt: number
          transactions: Transaction[]
          errors: { file: string; error: string }[]
        }>) || []).map(j => ({
          id: j.id,
          fileNames: j.fileNames,
          completedAt: j.completedAt,
          transactions: applyRules(j.transactions, rules),
          errors: j.errors || [],
        }))
        setCompletedJobs(jobs)
      } catch {
        // server unreachable — show whatever local state we have
      }
    })
  }, [])

  // Poll every active job until it terminates.
  useEffect(() => {
    if (activeJobs.length === 0) return

    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      const snapshot = activeJobs

      const results = await Promise.allSettled(
        snapshot.map(j =>
          fetch(`/api/parse/status?jobId=${encodeURIComponent(j.jobId)}`, { cache: 'no-store' })
            .then(r => r.json())
        )
      )
      if (cancelled) return

      const newCompleted: CompletedJob[] = []
      const newErrors: { file: string; error: string }[] = []
      const finishedIds = new Set<string>()

      results.forEach((res, i) => {
        const job = snapshot[i]
        if (res.status !== 'fulfilled') return
        const data = res.value

        if (data.status === 'done') {
          finishedIds.add(job.jobId)
          newCompleted.push({
            id: job.jobId,
            fileNames: data.fileNames || job.fileNames,
            completedAt: data.completedAt || Date.now(),
            transactions: applyRules((data.transactions || []) as Transaction[], merchantRules),
            errors: data.errors || [],
          })
        } else if (data.status === 'error' || data.status === 'missing') {
          finishedIds.add(job.jobId)
          newErrors.push({
            file: job.fileNames.join(', '),
            error: data.message || data.error || 'Job failed',
          })
        }
      })

      if (finishedIds.size === 0) return

      setCompletedJobs(prev => {
        const seen = new Set(prev.map(j => j.id))
        const adds = newCompleted.filter(j => !seen.has(j.id))
        return [...adds, ...prev]
      })
      setActiveJobs(prev => {
        const next = prev.filter(j => !finishedIds.has(j.jobId))
        saveActiveJobs(next)
        if (next.length === 0) setResumed(false)
        return next
      })
      if (newErrors.length > 0) {
        setErrors(prev => [...prev, ...newErrors])
      }
      const hasReviews = newCompleted.some(j => j.transactions.some(t => t.needsReview))
      if (hasReviews) setReviewOpen(true)
    }

    tick()
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeJobs, merchantRules])

  const emojiFor = (name: string): string => {
    if (DEFAULT_CATEGORY_EMOJIS[name]) return DEFAULT_CATEGORY_EMOJIS[name]
    return customCategories.find(c => c.name === name)?.emoji ?? '📌'
  }

  const pickerCategories = (() => {
    const all = [
      ...DEFAULT_CATEGORIES.filter(c => c !== 'Uncategorized').map(name => ({ name, emoji: DEFAULT_CATEGORY_EMOJIS[name] })),
      ...customCategories.map(c => ({ name: c.name, emoji: c.emoji })),
    ]
    const seen = new Set<string>()
    return all.filter(c => {
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
  })()

  const handleUpload = async (files: File[]) => {
    if (submitting || activeJobs.length > 0) return
    setSubmitting(true)
    setErrors([])

    const extraCategoriesJson =
      customCategories.length > 0
        ? JSON.stringify(customCategories.map(c => c.name))
        : null

    // Per-file POSTs in parallel — each request stays small (~500KB-2MB), well
    // under Vercel's 4.5MB body cap, and the server runs them concurrently.
    try {
      const results = await Promise.all(
        files.map(async file => {
          try {
            const formData = new FormData()
            formData.append('files', file)
            if (extraCategoriesJson) formData.append('extraCategories', extraCategoriesJson)
            const res = await fetch('/api/parse', { method: 'POST', body: formData })
            const data = await res.json()
            if (!res.ok || data.error) {
              return { ok: false as const, fileName: file.name, error: data.error || `Server returned ${res.status}` }
            }
            return {
              ok: true as const,
              job: {
                jobId: data.jobId as string,
                fileNames: (data.fileNames as string[]) || [file.name],
                startedAt: Date.now(),
              },
            }
          } catch (err) {
            return { ok: false as const, fileName: file.name, error: err instanceof Error ? err.message : 'Network error' }
          }
        })
      )

      const newJobs: ActiveJob[] = []
      const submitErrors: { file: string; error: string }[] = []
      results.forEach(r => {
        if (r.ok) newJobs.push(r.job)
        else submitErrors.push({ file: r.fileName, error: r.error })
      })

      if (newJobs.length > 0) {
        setActiveJobs(prev => {
          const next = [...prev, ...newJobs]
          saveActiveJobs(next)
          return next
        })
        setResumed(false)
      }
      if (submitErrors.length > 0) setErrors(submitErrors)
    } finally {
      setSubmitting(false)
    }
  }

  const cancelAllActive = () => {
    saveActiveJobs([])
    setActiveJobs([])
    setResumed(false)
  }

  const clearAllLocal = () => {
    // Local-only clear (doesn't delete from DB — user can re-load anytime
    // or use /history to permanently delete specific analyses).
    setCompletedJobs([])
    setErrors([])
    setYearFilter('all')
    setCategoryFilter('all')
  }

  const handleAssign = (transactionId: string, category: string, persistRule: boolean) => {
    const target = completedJobs
      .flatMap(j => j.transactions)
      .find(t => t.id === transactionId)
    if (!target) return
    const normalized = normalizeMerchant(target.description)

    const changedJobIds = new Set<string>()
    const updatedJobs = completedJobs.map(job => {
      let touched = false
      const newTxns = job.transactions.map(t => {
        if (t.id === transactionId) {
          touched = true
          return { ...t, category, needsReview: false, confidence: 1 }
        }
        if (persistRule && normalized && normalizeMerchant(t.description) === normalized) {
          touched = true
          return { ...t, category, needsReview: false, confidence: 1 }
        }
        return t
      })
      if (touched) changedJobIds.add(job.id)
      return touched ? { ...job, transactions: newTxns } : job
    })

    setCompletedJobs(updatedJobs)

    // Persist each affected job's transactions back to Supabase so the edit
    // survives reload. Fire-and-forget — the optimistic UI update is the
    // source of truth for the rest of this session.
    updatedJobs
      .filter(j => changedJobIds.has(j.id))
      .forEach(j => {
        fetch(`/api/parse/jobs?jobId=${encodeURIComponent(j.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: j.transactions }),
        }).catch(() => {})
      })

    if (persistRule && normalized) {
      setMerchantRules(prev => {
        const next = [
          ...prev.filter(r => r.normalizedMerchant !== normalized),
          {
            normalizedMerchant: normalized,
            category,
            displayName: target.subcategory || target.description,
            createdAt: Date.now(),
          },
        ]
        saveMerchantRules(next)
        return next
      })
    }
  }

  const handleCreateCategory = (cat: CustomCategory) => {
    setCustomCategories(prev => {
      if (prev.some(c => c.name === cat.name) || DEFAULT_CATEGORIES.includes(cat.name)) return prev
      const next = [...prev, cat]
      saveCustomCategories(next)
      return next
    })
  }

  // Derived state
  const allTransactions = completedJobs.flatMap(j => j.transactions)
  const processedFiles = [...new Set(completedJobs.flatMap(j => j.fileNames))]

  const years = [...new Set(
    allTransactions
      .map(t => t.date?.slice(0, 4))
      .filter(y => y && y !== 'unkn' && /^\d{4}$/.test(y))
  )].sort().reverse()

  // Stable totals for the tab labels (don't react to search/filter so the
  // counts in the tab pills stay consistent).
  const expenseTotalCount = allTransactions.filter(t => t.amount > 0).length
  const incomeTotalCount = allTransactions.filter(t => t.amount < 0).length

  const searchTerm = searchQuery.trim().toLowerCase()
  const filtered = allTransactions.filter(t => {
    if (activeTab === 'expenses' && !(t.amount > 0)) return false
    if (activeTab === 'income' && !(t.amount < 0)) return false
    if (yearFilter !== 'all' && !t.date?.startsWith(yearFilter)) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (searchTerm) {
      const hay = `${t.description} ${t.subcategory || ''} ${t.category} ${t.source}`.toLowerCase()
      if (!hay.includes(searchTerm)) return false
    }
    return true
  })

  const categoryMap = filtered.reduce<Record<string, Category>>((acc, t) => {
    if (!acc[t.category]) {
      acc[t.category] = {
        name: t.category,
        emoji: emojiFor(t.category),
        total: 0,
        count: 0,
        transactions: [],
      }
    }
    // Sum absolute amount so income totals (negative raw amounts) render
    // as the positive money received in the category.
    acc[t.category].total += Math.abs(t.amount)
    acc[t.category].count += 1
    acc[t.category].transactions.push(t)
    return acc
  }, {})

  const categories = Object.values(categoryMap).sort((a, b) => b.total - a.total)

  const tabTotal = filtered.reduce((s, t) => s + Math.abs(t.amount), 0)
  const taxDeductible = categories
    .filter(c => POTENTIALLY_DEDUCTIBLE.includes(c.name))
    .reduce((s, c) => s + c.total, 0)

  // For Income tab: largest source by subcategory (or description) total.
  const incomeSources = filtered.reduce<Record<string, number>>((acc, t) => {
    const key = t.subcategory || t.description || 'Unknown'
    acc[key] = (acc[key] || 0) + Math.abs(t.amount)
    return acc
  }, {})
  const topSource = Object.entries(incomeSources).sort((a, b) => b[1] - a[1])[0]

  // Review queue is global — show all needs-review across both tabs in the
  // banner since it shouldn't disappear just because user toggled to income.
  const reviewQueue = allTransactions.filter(t => t.needsReview)
  const totalAggregateFiles =
    activeJobs.reduce((s, j) => s + j.fileNames.length, 0) + processedFiles.length

  const exportAll = () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Category', 'Subcategory', 'Source'],
      ...filtered.map(t => [t.date, t.description, t.amount.toFixed(2), t.category, t.subcategory || '', t.source]),
    ]
    downloadCSV(rows, `transactions_${yearFilter !== 'all' ? yearFilter : 'all'}.csv`)
  }

  // Enter tax export mode with EVERY transaction pre-selected so the user
  // starts from "all in" and curates down by unchecking what doesn't belong.
  const enterTaxExportMode = () => {
    const all = new Set(allTransactions.map(t => t.id))
    setSelectedIds(all)
    setTaxExportMode(true)
  }

  const exitTaxExportMode = () => {
    setTaxExportMode(false)
    setSelectedIds(new Set())
  }

  const toggleTxnSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setCategorySelection = (_name: string, txnIds: string[], select: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (select) txnIds.forEach(id => next.add(id))
      else txnIds.forEach(id => next.delete(id))
      return next
    })
  }

  // CSV with Schedule C line, sorted by line so the preparer can sum per bucket.
  // Uses the curated selection when in tax export mode, otherwise the
  // currently-visible filtered list.
  const finalizeTaxExport = () => {
    const source = taxExportMode
      ? allTransactions.filter(t => selectedIds.has(t.id))
      : filtered

    const sorted = [...source].sort((a, b) => {
      const taxA = TAX_LINE[a.category] || 'Review'
      const taxB = TAX_LINE[b.category] || 'Review'
      if (taxA !== taxB) return taxA.localeCompare(taxB)
      return (a.date || '').localeCompare(b.date || '')
    })

    const rows = [
      ['Tax Line', 'Date', 'Description', 'Amount', 'App Category', 'Subcategory', 'Source'],
      ...sorted.map(t => [
        TAX_LINE[t.category] || 'Review',
        t.date,
        t.description,
        t.amount.toFixed(2),
        t.category,
        t.subcategory || '',
        t.source,
      ]),
    ]
    const suffix = taxExportMode ? `selected_${sorted.length}` : (yearFilter !== 'all' ? yearFilter : 'all')
    downloadCSV(rows, `tax_export_${suffix}.csv`)
    if (taxExportMode) exitTaxExportMode()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Statement Analyzer</h1>
            <p className="text-gray-500 mt-1">Upload bank statements & Amazon orders — AI categorizes everything for taxes</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/history"
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-3 py-2"
            >
              <History size={14} />
              History
            </Link>
            {(merchantRules.length > 0 || customCategories.length > 0) && (
              <div className="text-xs text-gray-400 text-right">
                <p>{merchantRules.length} merchant rule{merchantRules.length === 1 ? '' : 's'}</p>
                <p>{customCategories.length} custom categor{customCategories.length === 1 ? 'y' : 'ies'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <UploadZone onUpload={handleUpload} isProcessing={isProcessing} />

          {activeJobs.length > 0 && (
            <div className="mt-4 flex items-start justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2 min-w-0">
                <RefreshCw size={16} className="text-blue-600 animate-spin mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    {resumed
                      ? `Resuming ${activeJobs.length} upload${activeJobs.length === 1 ? '' : 's'}…`
                      : `Processing ${activeJobs.length} file${activeJobs.length === 1 ? '' : 's'} with AI…`}
                  </p>
                  <p className="text-xs text-blue-700/80 mt-0.5 break-words">
                    {activeJobs.flatMap(j => j.fileNames).join(', ')}
                  </p>
                  <p className="text-xs text-blue-700/60 mt-1">
                    Safe to switch tabs or close this one — work keeps running on the server. Results appear here when ready.
                  </p>
                </div>
              </div>
              <button
                onClick={cancelAllActive}
                className="text-blue-600 hover:text-blue-900 text-xs flex items-center gap-1 shrink-0"
                title="Stop watching all in-flight jobs"
              >
                <X size={14} />
                Stop watching
              </button>
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-4 space-y-2">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="text-sm"><strong>{e.file}:</strong> {e.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {completedJobs.length > 0 && (
          <>
            <ReviewBanner count={reviewQueue.length} onOpen={() => setReviewOpen(true)} />

            {taxExportMode && (
              <div className="sticky top-2 z-30 flex items-center justify-between gap-3 bg-emerald-600 text-white rounded-xl px-4 py-3 mb-4 shadow-lg flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <ListChecks size={18} className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Tax Export Mode</p>
                    <p className="text-xs text-emerald-100">
                      <span className="font-medium">{selectedIds.size}</span> of {allTransactions.length} transactions selected — uncheck what you don&apos;t want included.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedIds(new Set(allTransactions.map(t => t.id)))}
                    className="text-xs font-medium text-emerald-50 hover:text-white px-2 py-1 hidden sm:inline"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs font-medium text-emerald-50 hover:text-white px-2 py-1 hidden sm:inline"
                  >
                    Deselect all
                  </button>
                  <button
                    onClick={finalizeTaxExport}
                    disabled={selectedIds.size === 0}
                    className="text-sm font-semibold bg-white text-emerald-700 hover:bg-emerald-50 disabled:bg-emerald-100 disabled:text-emerald-300 px-4 py-1.5 rounded-lg flex items-center gap-1.5"
                  >
                    <Download size={14} />
                    Export {selectedIds.size}
                  </button>
                  <button
                    onClick={exitTaxExportMode}
                    className="text-sm font-medium text-emerald-50 hover:text-white border border-emerald-400 hover:border-white rounded-lg px-3 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Expenses vs Income tab toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4 max-w-md">
              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  activeTab === 'expenses'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <TrendingDown size={14} className={activeTab === 'expenses' ? 'text-red-500' : ''} />
                Expenses ({expenseTotalCount})
              </button>
              <button
                onClick={() => setActiveTab('income')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  activeTab === 'income'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <TrendingUp size={14} className={activeTab === 'income' ? 'text-green-500' : ''} />
                Money In ({incomeTotalCount})
              </button>
            </div>

            {/* Per-tab summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className={`flex items-center gap-2 mb-1 ${activeTab === 'expenses' ? 'text-red-500' : 'text-green-500'}`}>
                  {activeTab === 'expenses' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {activeTab === 'expenses' ? 'Total Spent' : 'Total Received'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${tabTotal.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {filtered.length} {activeTab === 'expenses' ? 'transaction' : 'payment'}{filtered.length === 1 ? '' : 's'}
                  {searchTerm && ' matching search'}
                </p>
              </div>

              {activeTab === 'expenses' ? (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-blue-500 mb-1">
                    <BarChart3 size={16} />
                    <span className="text-xs font-medium uppercase tracking-wide">Potentially Deductible</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">${taxDeductible.toFixed(2)}</p>
                  <p className="text-xs text-gray-400 mt-1">Gas, Medical, Education, Charity, Business…</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-emerald-500 mb-1">
                    <BarChart3 size={16} />
                    <span className="text-xs font-medium uppercase tracking-wide">Largest Source</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {topSource ? `$${topSource[1].toFixed(2)}` : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {topSource ? topSource[0] : 'No income in this view'}
                  </p>
                </div>
              )}
            </div>

            {/* Search + filters */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setSearchQuery('')}
                  placeholder={`Search ${activeTab === 'expenses' ? 'expenses' : 'income'} by merchant, category, source…`}
                  className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
              </select>
              {reviewQueue.length > 0 && (
                <button
                  onClick={() => setReviewOpen(true)}
                  className="flex items-center gap-1 text-sm font-medium text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-2"
                >
                  <FlagTriangleRight size={14} />
                  Review ({reviewQueue.length})
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-xs text-gray-400">
                {searchTerm ? (
                  <>
                    <span className="font-medium text-gray-600">{filtered.length}</span> match{filtered.length === 1 ? '' : 'es'} for &ldquo;{searchQuery}&rdquo;
                  </>
                ) : (
                  <>
                    Showing {totalAggregateFiles} file{totalAggregateFiles === 1 ? '' : 's'} from {completedJobs.length} analys{completedJobs.length === 1 ? 'is' : 'es'}.{' '}
                    <Link href="/history" className="underline hover:text-gray-600">Manage in History →</Link>
                  </>
                )}
              </p>
              <div className="flex gap-2 flex-wrap">
                {!taxExportMode && (
                  <button
                    onClick={enterTaxExportMode}
                    className="flex items-center gap-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 transition-colors"
                    title="Pick which transactions to include in the tax export"
                  >
                    <ListChecks size={14} />
                    Tax Export…
                  </button>
                )}
                <button
                  onClick={exportAll}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-4 py-2 transition-colors"
                >
                  <Download size={14} />
                  CSV
                </button>
                <button
                  onClick={clearAllLocal}
                  className="text-sm text-red-500 hover:text-red-700 border border-red-200 bg-white rounded-lg px-4 py-2 transition-colors"
                  title="Hide all loaded analyses from this view (data still in History — go there to permanently delete)"
                >
                  Hide All
                </button>
              </div>
            </div>

            {/* Search mode: flat results. Otherwise: category cards. */}
            {searchTerm ? (
              filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>No matches for &ldquo;{searchQuery}&rdquo;</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...filtered]
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .map(t => {
                      const isSelected = taxExportMode && selectedIds.has(t.id)
                      return (
                        <div
                          key={t.id}
                          className={`border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${
                            isSelected
                              ? 'bg-emerald-50/50 border-emerald-300'
                              : 'bg-white border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          {taxExportMode && (
                            <button
                              onClick={() => toggleTxnSelection(t.id)}
                              className={`shrink-0 p-1 rounded ${isSelected ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-500'}`}
                              title={isSelected ? 'Remove from tax export' : 'Add to tax export'}
                            >
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>
                          )}
                          <span className="text-2xl shrink-0" title={t.category}>{emojiFor(t.category)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-400">
                              <span>{t.date}</span>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-600">{t.category}</span>
                              {t.subcategory && t.subcategory !== t.description && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-blue-500">{t.subcategory}</span>
                                </>
                              )}
                              <span className="text-gray-300">·</span>
                              <span className="truncate">{t.source}</span>
                            </div>
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                            {t.amount < 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                          </span>
                          {!taxExportMode && (
                            <button
                              onClick={() => setEditingTxn(t)}
                              className="text-gray-300 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 shrink-0"
                              title="Move to a different category"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            ) : (
              <>
                <div className="space-y-3">
                  {categories.map(cat => (
                    <CategoryCard
                      key={cat.name}
                      category={cat}
                      onEditTransaction={setEditingTxn}
                      selectionMode={taxExportMode}
                      selectedIds={selectedIds}
                      onToggleTransaction={toggleTxnSelection}
                      onSetCategorySelection={setCategorySelection}
                    />
                  ))}
                </div>
                {categories.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <p>
                      {activeTab === 'income'
                        ? 'No income transactions in this view yet'
                        : 'No transactions match the current filters'}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ReviewPanel
        open={reviewOpen || editingTxn !== null}
        onClose={() => {
          setReviewOpen(false)
          setEditingTxn(null)
        }}
        queue={editingTxn ? [editingTxn] : reviewQueue}
        knownCategories={pickerCategories}
        onAssign={handleAssign}
        onCreateCategory={handleCreateCategory}
        singleMode={editingTxn !== null}
      />
    </div>
  )
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
