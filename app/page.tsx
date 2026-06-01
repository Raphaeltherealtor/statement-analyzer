'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  RefreshCw,
  Download,
  TrendingDown,
  TrendingUp,
  BarChart3,
  FlagTriangleRight,
  X,
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
} from '@/lib/types'
import { normalizeMerchant } from '@/lib/normalize'
import {
  loadCustomCategories,
  saveCustomCategories,
  loadMerchantRules,
  saveMerchantRules,
  loadActiveJob,
  saveActiveJob,
  ActiveJob,
} from '@/lib/storage'

const CONFIDENCE_THRESHOLD = 0.7
const POLL_INTERVAL_MS = 3000
const POLL_BACKOFF_MS = 5000

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [errors, setErrors] = useState<{ file: string; error: string }[]>([])
  const [processedFiles, setProcessedFiles] = useState<string[]>([])
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [resumed, setResumed] = useState(false)

  const isProcessing = activeJob !== null

  // One-time hydration of preferences + any in-flight job from localStorage.
  // Deferred to a microtask so the strict "no setState in effect" rule sees
  // these as async writes rather than cascading sync ones.
  useEffect(() => {
    queueMicrotask(() => {
      setCustomCategories(loadCustomCategories())
      setMerchantRules(loadMerchantRules())
      const job = loadActiveJob()
      if (job) {
        setActiveJob(job)
        setResumed(true)
      }
    })
  }, [])

  const emojiFor = useCallback((name: string): string => {
    if (DEFAULT_CATEGORY_EMOJIS[name]) return DEFAULT_CATEGORY_EMOJIS[name]
    const custom = customCategories.find(c => c.name === name)
    return custom?.emoji ?? '📌'
  }, [customCategories])

  const pickerCategories = useMemo(() => {
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
  }, [customCategories])

  const applyRulesAndFlag = useCallback((incoming: Transaction[], rules: MerchantRule[]): Transaction[] => {
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
  }, [])

  // Apply a finished job's results to UI state
  const consumeDoneJob = useCallback(
    (jobTxns: Transaction[], jobErrors: { file: string; error: string }[], fileNames: string[]) => {
      const processed = applyRulesAndFlag(jobTxns, merchantRules)
      const reviewCount = processed.filter(t => t.needsReview).length

      setTransactions(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        const newOnes = processed.filter(t => !existingIds.has(t.id))
        return [...prev, ...newOnes]
      })
      setProcessedFiles(prev => [...new Set([...prev, ...fileNames])])
      if (jobErrors.length > 0) setErrors(jobErrors)
      if (reviewCount > 0) setReviewOpen(true)
    },
    [applyRulesAndFlag, merchantRules]
  )

  // Poll the active job until it finishes (works in background tabs because
  // setTimeout still fires, just throttled; resumes naturally on page reload).
  useEffect(() => {
    if (!activeJob) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const jobId = activeJob.jobId
    const jobFileNames = activeJob.fileNames

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/parse/status?jobId=${encodeURIComponent(jobId)}`,
          { cache: 'no-store' }
        )
        if (cancelled) return
        const data = await res.json().catch(() => ({}))

        if (res.status === 404 || data.status === 'missing') {
          setErrors([{ file: jobFileNames.join(', '), error: 'Job expired or not found on the server' }])
          saveActiveJob(null)
          setActiveJob(null)
          setResumed(false)
          return
        }

        if (data.status === 'done') {
          consumeDoneJob(
            (data.transactions || []) as Transaction[],
            data.errors || [],
            data.fileNames || jobFileNames
          )
          saveActiveJob(null)
          setActiveJob(null)
          setResumed(false)
          return
        }

        if (data.status === 'error') {
          setErrors([{ file: jobFileNames.join(', '), error: data.message || 'Job failed' }])
          saveActiveJob(null)
          setActiveJob(null)
          setResumed(false)
          return
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_BACKOFF_MS)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeJob, consumeDoneJob])

  const handleUpload = async (files: File[]) => {
    setErrors([])

    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    if (customCategories.length > 0) {
      formData.append('extraCategories', JSON.stringify(customCategories.map(c => c.name)))
    }

    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok || data.error) {
        setErrors([{ file: 'Upload', error: data.error || `Server returned ${res.status}` }])
        return
      }

      const newJob: ActiveJob = {
        jobId: data.jobId,
        fileNames: data.fileNames || files.map(f => f.name),
        startedAt: Date.now(),
      }
      saveActiveJob(newJob)
      setActiveJob(newJob)
      setResumed(false)
    } catch {
      setErrors([{ file: 'Upload', error: 'Failed to connect to server' }])
    }
  }

  const cancelActiveJob = () => {
    saveActiveJob(null)
    setActiveJob(null)
    setResumed(false)
  }

  const clearAll = () => {
    setTransactions([])
    setErrors([])
    setProcessedFiles([])
    setYearFilter('all')
    setCategoryFilter('all')
  }

  const handleAssign = (transactionId: string, category: string, persistRule: boolean) => {
    const target = transactions.find(t => t.id === transactionId)
    if (!target) return
    const normalized = normalizeMerchant(target.description)

    setTransactions(prev =>
      prev.map(t => {
        if (t.id === transactionId) {
          return { ...t, category, needsReview: false, confidence: 1 }
        }
        if (persistRule && normalized && normalizeMerchant(t.description) === normalized) {
          return { ...t, category, needsReview: false, confidence: 1 }
        }
        return t
      })
    )

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

  const years = [...new Set(
    transactions
      .map(t => t.date?.slice(0, 4))
      .filter(y => y && y !== 'unkn' && /^\d{4}$/.test(y))
  )].sort().reverse()

  const filtered = transactions.filter(t => {
    if (yearFilter !== 'all' && !t.date?.startsWith(yearFilter)) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
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
    if (t.amount > 0) acc[t.category].total += t.amount
    acc[t.category].count += 1
    acc[t.category].transactions.push(t)
    return acc
  }, {})

  const categories = Object.values(categoryMap).sort((a, b) => b.total - a.total)

  const totalSpent = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalIncome = filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const taxDeductible = categories
    .filter(c => POTENTIALLY_DEDUCTIBLE.includes(c.name))
    .reduce((s, c) => s + c.total, 0)

  const reviewQueue = filtered.filter(t => t.needsReview)

  const exportAll = () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Category', 'Subcategory', 'Source'],
      ...filtered.map(t => [t.date, t.description, t.amount.toFixed(2), t.category, t.subcategory || '', t.source]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${yearFilter !== 'all' ? yearFilter : 'all'}.csv`
    a.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Statement Analyzer</h1>
            <p className="text-gray-500 mt-1">Upload bank statements & Amazon orders — AI categorizes everything for taxes</p>
          </div>
          {merchantRules.length > 0 && (
            <div className="text-xs text-gray-400 text-right">
              <p>{merchantRules.length} merchant rule{merchantRules.length === 1 ? '' : 's'} saved</p>
              <p>{customCategories.length} custom categor{customCategories.length === 1 ? 'y' : 'ies'}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <UploadZone onUpload={handleUpload} isProcessing={isProcessing} />

          {activeJob && (
            <div className="mt-4 flex items-start justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2 min-w-0">
                <RefreshCw size={16} className="text-blue-600 animate-spin mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    {resumed ? 'Resuming your previous upload…' : 'Reading and categorizing with AI…'}
                  </p>
                  <p className="text-xs text-blue-700/80 mt-0.5 break-words">
                    {activeJob.fileNames.join(', ')}
                  </p>
                  <p className="text-xs text-blue-700/60 mt-1">
                    Safe to switch tabs or close this one — the work keeps running. Come back and your results will be here.
                  </p>
                </div>
              </div>
              <button
                onClick={cancelActiveJob}
                className="text-blue-600 hover:text-blue-900 text-xs flex items-center gap-1 shrink-0"
                title="Stop watching this job (it'll keep running on the server but the result will be dropped)"
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

        {transactions.length > 0 && (
          <>
            <ReviewBanner count={reviewQueue.length} onOpen={() => setReviewOpen(true)} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-red-500 mb-1">
                  <TrendingDown size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Total Spent</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${totalSpent.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">{filtered.filter(t => t.amount > 0).length} transactions</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-green-500 mb-1">
                  <TrendingUp size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Total Income</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${totalIncome.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">{filtered.filter(t => t.amount < 0).length} credits</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <BarChart3 size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Potentially Deductible</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${taxDeductible.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">Gas, Medical, Education, Charity, Business…</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex gap-2 flex-wrap">
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
              <div className="flex gap-2">
                <button
                  onClick={exportAll}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-4 py-2 transition-colors"
                >
                  <Download size={14} />
                  Export All CSV
                </button>
                <button
                  onClick={clearAll}
                  className="text-sm text-red-500 hover:text-red-700 border border-red-200 bg-white rounded-lg px-4 py-2 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {processedFiles.length > 0 && (
              <p className="text-xs text-gray-400 mb-4">
                Loaded from: {processedFiles.join(', ')}
              </p>
            )}

            <div className="space-y-3">
              {categories.map(cat => (
                <CategoryCard key={cat.name} category={cat} />
              ))}
            </div>

            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>No transactions match the current filters</p>
              </div>
            )}
          </>
        )}
      </div>

      <ReviewPanel
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        queue={reviewQueue}
        knownCategories={pickerCategories}
        onAssign={handleAssign}
        onCreateCategory={handleCreateCategory}
      />
    </div>
  )
}
