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
  Sparkles,
  FileText,
} from 'lucide-react'
import UploadZone from '@/components/UploadZone'
import CategoryCard from '@/components/CategoryCard'
import ReviewPanel from '@/components/ReviewPanel'
import ReviewBanner from '@/components/ReviewBanner'
import RecategorizePreview, { RecategorizeProposal } from '@/components/RecategorizePreview'
import ManageCategoriesModal from '@/components/ManageCategoriesModal'
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

  // AI re-categorize flow: open modal, kick off Claude call, preview diff,
  // user accepts/rejects per change, apply to local + Supabase.
  const [recatOpen, setRecatOpen] = useState(false)
  const [recatLoading, setRecatLoading] = useState(false)
  const [recatProposals, setRecatProposals] = useState<RecategorizeProposal[] | null>(null)
  const [recatProgress, setRecatProgress] = useState<{ done: number; total: number } | null>(null)

  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)

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

  // Move every transaction in `source` category into `target`, then drop the
  // source from custom-categories + repoint any merchant rules. Used by the
  // Manage Categories modal to clean up duplicate buckets like "Marketing"
  // overlapping with "Marketing & Advertising".
  const mergeCategory = async (source: string, target: string) => {
    if (source === target) return

    const changedJobIds = new Set<string>()
    const updatedJobs = completedJobs.map(job => {
      let touched = false
      const newTxns = job.transactions.map(t => {
        if (t.category === source) {
          touched = true
          return { ...t, category: target, needsReview: false }
        }
        return t
      })
      if (touched) changedJobIds.add(job.id)
      return touched ? { ...job, transactions: newTxns } : job
    })

    setCompletedJobs(updatedJobs)

    // Persist each affected job
    await Promise.all(
      updatedJobs
        .filter(j => changedJobIds.has(j.id))
        .map(j =>
          fetch(`/api/parse/jobs?jobId=${encodeURIComponent(j.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: j.transactions }),
          }).catch(() => {})
        )
    )

    // Repoint merchant rules that pointed at the merged-away category
    setMerchantRules(prev => {
      const next = prev.map(r => (r.category === source ? { ...r, category: target } : r))
      saveMerchantRules(next)
      return next
    })

    // If the source was a custom category, drop it from the picker list now
    // that it has no purpose.
    setCustomCategories(prev => {
      if (!prev.some(c => c.name === source)) return prev
      const next = prev.filter(c => c.name !== source)
      saveCustomCategories(next)
      return next
    })
  }

  const deleteCustomCategory = (name: string) => {
    setCustomCategories(prev => {
      if (!prev.some(c => c.name === name)) return prev
      const next = prev.filter(c => c.name !== name)
      saveCustomCategories(next)
      return next
    })
  }

  const startRecategorize = async () => {
    // Snapshot transactions at click time so the proposals match what the
    // user saw when they triggered it.
    const txns = completedJobs.flatMap(j => j.transactions)
    if (txns.length === 0) return

    setRecatOpen(true)
    setRecatProposals(null)
    setRecatLoading(true)
    setRecatProgress({ done: 0, total: 0 })

    // 100 per batch fits Haiku inside the 60s function cap with margin.
    // PARALLEL_LIMIT keeps us from hammering Anthropic's per-minute rate
    // limits with a flood of large concurrent calls.
    const BATCH_SIZE = 100
    const PARALLEL_LIMIT = 3
    const batches: Transaction[][] = []
    for (let i = 0; i < txns.length; i += BATCH_SIZE) {
      batches.push(txns.slice(i, i + BATCH_SIZE))
    }
    setRecatProgress({ done: 0, total: batches.length })

    const extraCategories = customCategories.map(c => c.name)

    type BatchResult = {
      results?: Array<{ id: string; category: string; subcategory?: string; confidence: number }>
      error?: string
    }

    const runBatch = async (batch: Transaction[]): Promise<BatchResult> => {
      try {
        const res = await fetch('/api/parse/recategorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions: batch.map(t => ({
              id: t.id,
              description: t.description,
              amount: t.amount,
              date: t.date,
              currentCategory: t.category,
            })),
            extraCategories,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.error) {
          return { error: (data.error as string) || `Server returned ${res.status}` }
        }
        return {
          results: data.results as Array<{ id: string; category: string; subcategory?: string; confidence: number }>,
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Network error' }
      }
    }

    // Up to 3 attempts per batch with 2s -> 8s backoff. Most "failures" we
    // saw turned out to be flaky network or rate-limit blips that succeed on
    // the very next try, so this dramatically improves end-to-end success
    // without adding meaningful wall time when batches succeed first try.
    const runBatchWithRetry = async (batch: Transaction[]): Promise<BatchResult> => {
      let last: BatchResult = { error: 'never ran' }
      for (let attempt = 1; attempt <= 3; attempt++) {
        last = await runBatch(batch)
        if (!last.error) return last
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000 * Math.pow(4, attempt - 1)))
        }
      }
      return last
    }

    try {
      // Run in waves of PARALLEL_LIMIT so we get parallelism without exceeding
      // rate limits or flooding the function pool. Each wave updates progress.
      const responses: BatchResult[] = []
      for (let i = 0; i < batches.length; i += PARALLEL_LIMIT) {
        const wave = batches.slice(i, i + PARALLEL_LIMIT)
        const waveResults = await Promise.all(wave.map(runBatchWithRetry))
        responses.push(...waveResults)
        setRecatProgress({ done: Math.min(i + PARALLEL_LIMIT, batches.length), total: batches.length })
      }

      const failed = responses.filter(r => r.error)
      if (failed.length > 0) {
        const firstError = failed[0].error
        setErrors([{
          file: 'AI Re-categorize',
          error: `${failed.length} of ${batches.length} batch${batches.length === 1 ? '' : 'es'} failed: ${firstError}`,
        }])
        if (failed.length === batches.length) {
          setRecatOpen(false)
          return
        }
      }

      const byId = new Map<string, { category: string; subcategory?: string; confidence: number }>()
      responses.forEach(r => {
        if (r.results) {
          r.results.forEach(item => byId.set(item.id, item))
        }
      })

      const proposals: RecategorizeProposal[] = txns.map(t => {
        const r = byId.get(t.id)
        return {
          transaction: t,
          newCategory: r?.category || t.category,
          newSubcategory: r?.subcategory,
          confidence: r?.confidence ?? 1,
        }
      })
      setRecatProposals(proposals)
    } catch (err) {
      setErrors([{ file: 'AI Re-categorize', error: err instanceof Error ? err.message : 'Failed to reach server' }])
      setRecatOpen(false)
    } finally {
      setRecatLoading(false)
      setRecatProgress(null)
    }
  }

  const applyRecategorizeProposals = async (accepted: RecategorizeProposal[]) => {
    if (accepted.length === 0) {
      setRecatOpen(false)
      setRecatProposals(null)
      return
    }

    const proposalById = new Map(accepted.map(p => [p.transaction.id, p]))
    const changedJobIds = new Set<string>()

    const updatedJobs = completedJobs.map(job => {
      let touched = false
      const newTxns = job.transactions.map(t => {
        const p = proposalById.get(t.id)
        if (p && p.newCategory !== t.category) {
          touched = true
          return {
            ...t,
            category: p.newCategory,
            subcategory: p.newSubcategory || t.subcategory,
            confidence: p.confidence,
            needsReview: false,
          }
        }
        return t
      })
      if (touched) changedJobIds.add(job.id)
      return touched ? { ...job, transactions: newTxns } : job
    })

    setCompletedJobs(updatedJobs)

    await Promise.all(
      updatedJobs
        .filter(j => changedJobIds.has(j.id))
        .map(j =>
          fetch(`/api/parse/jobs?jobId=${encodeURIComponent(j.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: j.transactions }),
          }).catch(() => {})
        )
    )

    setRecatOpen(false)
    setRecatProposals(null)
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

  // Tax-line-labeled CSV using the current filter view. Curation of which
  // transactions land in the printed tax checklist lives at /tax-checklist
  // now — this stays as a quick raw export for power users.
  const exportTaxCsv = () => {
    const sorted = [...filtered].sort((a, b) => {
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
    downloadCSV(rows, `tax_lines_${yearFilter !== 'all' ? yearFilter : 'all'}.csv`)
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
              href="/tax-checklist"
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg px-3 py-2"
              title="CPA-ready deduction checklist with per-year saving"
            >
              <FileText size={14} />
              Tax Checklist
            </Link>
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
                {customCategories.length > 0 ? (
                  <button
                    onClick={() => setManageCategoriesOpen(true)}
                    className="text-amber-600 hover:text-amber-800 underline-offset-2 hover:underline"
                    title="Merge custom categories into existing ones (e.g. 'Marketing' → 'Marketing & Advertising')"
                  >
                    {customCategories.length} custom categor{customCategories.length === 1 ? 'y' : 'ies'} · manage
                  </button>
                ) : (
                  <p>0 custom categories</p>
                )}
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
                <button
                  onClick={startRecategorize}
                  className="flex items-center gap-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 transition-colors"
                  title="Have AI re-classify all transactions using the latest real-estate-aware rules"
                >
                  <Sparkles size={14} />
                  AI Re-categorize
                </button>
                <button
                  onClick={exportTaxCsv}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-4 py-2 transition-colors"
                  title="Quick tax-line CSV of the current view. For the curated CPA-ready checklist with manual fields and per-txn picking, use Tax Checklist."
                >
                  <Download size={14} />
                  Tax CSV
                </button>
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
                    .map(t => (
                      <div
                        key={t.id}
                        className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-blue-300 transition-colors"
                      >
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
                        <button
                          onClick={() => setEditingTxn(t)}
                          className="text-gray-300 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 shrink-0"
                          title="Move to a different category"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    ))}
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

      {recatOpen && (
        <RecategorizePreview
          loading={recatLoading}
          progress={recatProgress}
          proposals={recatProposals}
          knownCategories={pickerCategories}
          emojiFor={emojiFor}
          onClose={() => {
            setRecatOpen(false)
            setRecatProposals(null)
            setRecatProgress(null)
          }}
          onApply={applyRecategorizeProposals}
        />
      )}

      {manageCategoriesOpen && (
        <ManageCategoriesModal
          onClose={() => setManageCategoriesOpen(false)}
          customCategories={customCategories}
          transactionCounts={
            // Build live count per category from all loaded transactions
            allTransactions.reduce<Map<string, number>>((acc, t) => {
              acc.set(t.category, (acc.get(t.category) || 0) + 1)
              return acc
            }, new Map())
          }
          allCategories={pickerCategories}
          onMerge={mergeCategory}
          onDelete={deleteCustomCategory}
        />
      )}
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
