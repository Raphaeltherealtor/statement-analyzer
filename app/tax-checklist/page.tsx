'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Printer,
  Save,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  MinusSquare,
  Search,
  ListChecks,
  FileText,
} from 'lucide-react'
import { CHECKLIST, ChecklistRow, SECTIONS_IN_SCHEDULE_C_TOTAL } from '@/lib/checklist-template'
import { WorkspaceData } from '@/lib/tax-workspace'
import {
  Transaction,
  CustomCategory,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_EMOJIS,
} from '@/lib/types'
import { loadCustomCategories } from '@/lib/storage'

const NOW_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [NOW_YEAR + 1, NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2, NOW_YEAR - 3]

// Pick out the transactions a category-based row pulls from. Used both to
// compute the running total and to render the inline picker that lets the
// user exclude individual rows from the checklist.
function txnsForCategories(txns: Transaction[], categories: string[]): Transaction[] {
  const set = new Set(categories)
  return txns.filter(t => set.has(t.category))
}

function sumTxns(txns: Transaction[]): number {
  return txns.reduce((s, t) => s + Math.abs(t.amount), 0)
}

function readPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function writePath(obj: WorkspaceData, path: string, value: unknown): WorkspaceData {
  const next = JSON.parse(JSON.stringify(obj)) as WorkspaceData
  const parts = path.split('.')
  const last = parts.pop()
  if (!last) return next
  let cur: Record<string, unknown> = next as unknown as Record<string, unknown>
  for (const p of parts) {
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p] as Record<string, unknown>
  }
  if (value === '' || value == null || (typeof value === 'number' && !Number.isFinite(value))) {
    delete cur[last]
  } else {
    cur[last] = value
  }
  return next
}

// Decide what kind of input a workspace-path row needs based on its key name.
function inferInputType(path: string): 'date' | 'text' | 'money' {
  if (path.endsWith('Date')) return 'date'
  if (path.endsWith('.type') || path.endsWith('.notes')) return 'text'
  return 'money'
}

interface CompletedJob {
  id: string
  fileNames: string[]
  completedAt: number
  transactions: Transaction[]
  errors: { file: string; error: string }[]
}

export default function TaxChecklistPage() {
  const [year, setYear] = useState<number>(NOW_YEAR)
  const [workspace, setWorkspace] = useState<WorkspaceData>({})
  const [savedYears, setSavedYears] = useState<number[]>([])
  // Hold the entire jobs payload so we can map a transaction back to its
  // owning sa_parse_jobs row when the user edits a category inline.
  const [jobs, setJobs] = useState<CompletedJob[]>([])
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Which auto rows are currently expanded (showing their underlying txns).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  // Top-level view: 'checklist' (CPA-formatted) or 'curate' (flat editor
  // for picking/recategorizing every txn in the year).
  const [view, setView] = useState<'checklist' | 'curate'>('checklist')
  // Curate-view filter state
  const [curateSearch, setCurateSearch] = useState('')
  const [curateCategoryFilter, setCurateCategoryFilter] = useState<string>('all')

  // Load workspace + all transactions whenever the year changes
  useEffect(() => {
    let cancelled = false
    queueMicrotask(async () => {
      setLoading(true)
      try {
        const [wsRes, txnsRes, listRes] = await Promise.all([
          fetch(`/api/tax-workspace?year=${year}`),
          fetch(`/api/parse/jobs`),
          fetch(`/api/tax-workspace?list=1`),
        ])
        if (cancelled) return

        const wsData = await wsRes.json().catch(() => ({}))
        const txnsData = await txnsRes.json().catch(() => ({}))
        const listData = await listRes.json().catch(() => ({}))

        if (cancelled) return
        setWorkspace(wsData.workspace || {})
        setDirty(false)

        const incomingJobs = ((txnsData.jobs as CompletedJob[]) || [])
        setJobs(incomingJobs)
        setCustomCategories(loadCustomCategories())

        setSavedYears(((listData.years as number[]) || []).slice())
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [year])

  const updateManual = (key: string, value: number) => {
    setWorkspace(w => ({
      ...w,
      manualItems: { ...(w.manualItems || {}), [key]: value },
    }))
    setDirty(true)
  }

  const updateWorkspacePath = (path: string, value: unknown) => {
    setWorkspace(w => writePath(w, path, value))
    setDirty(true)
  }

  // Excluded transaction IDs for this year (memoized as a Set for fast lookup).
  const excludedIds = useMemo(
    () => new Set(workspace.excludedTxnIds || []),
    [workspace.excludedTxnIds]
  )

  const setExcluded = (id: string, exclude: boolean) => {
    setWorkspace(w => {
      const current = new Set(w.excludedTxnIds || [])
      if (exclude) current.add(id)
      else current.delete(id)
      return { ...w, excludedTxnIds: Array.from(current) }
    })
    setDirty(true)
  }

  const setManyExcluded = (ids: string[], exclude: boolean) => {
    if (ids.length === 0) return
    setWorkspace(w => {
      const current = new Set(w.excludedTxnIds || [])
      if (exclude) ids.forEach(id => current.add(id))
      else ids.forEach(id => current.delete(id))
      return { ...w, excludedTxnIds: Array.from(current) }
    })
    setDirty(true)
  }

  const toggleRowExpanded = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Year-scoped transaction list — derived from all loaded jobs.
  const transactions = useMemo(
    () => jobs.flatMap(j => j.transactions || []).filter(t => t.date?.startsWith(String(year))),
    [jobs, year]
  )

  // All categories the picker should show (defaults + customs).
  const pickerCategories = useMemo(() => {
    const all = [
      ...DEFAULT_CATEGORIES.filter(c => c !== 'Uncategorized').map(name => ({
        name,
        emoji: DEFAULT_CATEGORY_EMOJIS[name],
      })),
      ...customCategories.map(c => ({ name: c.name, emoji: c.emoji })),
    ]
    const seen = new Set<string>()
    return all.filter(c => {
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
  }, [customCategories])

  // Re-categorize a single transaction inline and persist the owning job.
  // Used by both the per-row expansion in the checklist and the curate
  // view's flat list.
  const updateTransactionCategory = (txnId: string, newCategory: string) => {
    let touchedJob: CompletedJob | null = null
    const updated = jobs.map(job => {
      if (!job.transactions.some(t => t.id === txnId)) return job
      const newTxns = job.transactions.map(t =>
        t.id === txnId ? { ...t, category: newCategory, needsReview: false } : t
      )
      const next = { ...job, transactions: newTxns }
      touchedJob = next
      return next
    })
    setJobs(updated)

    if (touchedJob) {
      // The closure captures touchedJob at write time, so we re-cast to
      // satisfy TS — null check above already gates this.
      const tj = touchedJob as CompletedJob
      fetch(`/api/parse/jobs?jobId=${encodeURIComponent(tj.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: tj.transactions }),
      }).catch(() => {})
    }
  }

  const emojiFor = (name: string) =>
    DEFAULT_CATEGORY_EMOJIS[name] ?? customCategories.find(c => c.name === name)?.emoji ?? '📌'

  const handleSave = async () => {
    setSaving(true)
    setJustSaved(false)
    try {
      const res = await fetch(`/api/tax-workspace?year=${year}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: workspace }),
      })
      if (res.ok) {
        setDirty(false)
        setJustSaved(true)
        if (!savedYears.includes(year)) setSavedYears(prev => [year, ...prev])
        setTimeout(() => setJustSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  // Compute the value behind each checklist row given the live workspace + txns
  type RowValue =
    | { kind: 'number'; value: number }
    | { kind: 'date'; value: string | null }
    | { kind: 'text'; value: string | null }

  // For auto rows, return the transactions that back the row so we can both
  // sum them and render the expand-to-cherry-pick UI.
  const txnsBackingRow = (row: ChecklistRow): Transaction[] => {
    const s = row.source
    if (s.kind === 'category') return txnsForCategories(transactions, [s.category])
    if (s.kind === 'aggregate') return txnsForCategories(transactions, s.categories)
    return []
  }

  const rowValueAndKind = (row: ChecklistRow): RowValue => {
    const s = row.source
    if (s.kind === 'category' || s.kind === 'aggregate') {
      const included = txnsBackingRow(row).filter(t => !excludedIds.has(t.id))
      return { kind: 'number', value: sumTxns(included) }
    }
    if (s.kind === 'manual') {
      return { kind: 'number', value: workspace.manualItems?.[s.key] ?? 0 }
    }
    // workspace path — type depends on path
    const raw = readPath(workspace, s.path)
    const kind = inferInputType(s.path)
    if (kind === 'money') {
      return { kind: 'number', value: typeof raw === 'number' ? raw : 0 }
    }
    return { kind, value: typeof raw === 'string' ? raw : null }
  }

  // Section subtotals (only meaningful for money sections — skip non-money rows)
  const sectionMoneyTotal = (sectionIdx: number): number => {
    const section = CHECKLIST[sectionIdx]
    return section.rows.reduce((s, row) => {
      const v = rowValueAndKind(row)
      if (v.kind === 'number') return s + v.value
      return s
    }, 0)
  }

  // Headline "Schedule C subtotal" — sum of sections marked in the template
  const scheduleCSubtotal = useMemo(() => {
    return CHECKLIST.reduce((sum, section, idx) => {
      if (!SECTIONS_IN_SCHEDULE_C_TOTAL.has(section.title)) return sum
      return sum + sectionMoneyTotal(idx)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, workspace])

  // Home office pro-rata = office sq ft / total sq ft, multiplied against the
  // home-office utility totals the user entered.
  const homeOfficePct = (() => {
    const total = workspace.homeOffice?.totalSqFt
    const office = workspace.homeOffice?.officeSqFt
    if (!total || !office || total <= 0) return 0
    return Math.min(office / total, 1)
  })()

  const homeOfficeProRata = (() => {
    const ho = workspace.homeOffice
    if (!ho || homeOfficePct === 0) return 0
    const wholeHomeFields = [
      ho.firstMortgageInterest,
      ho.secondMortgageInterest,
      ho.equityLineInterest,
      ho.propertyTaxes,
      ho.insurance,
      ho.repairsWholeHome,
      ho.cleaning,
      ho.condoFee,
      ho.electricity,
      ho.gas,
      ho.water,
      ho.trash,
      ho.alarm,
    ]
    const wholeTotal = wholeHomeFields.reduce<number>((s, v) => s + (v || 0), 0)
    return wholeTotal * homeOfficePct + (ho.repairsOfficeOnly || 0)
  })()

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-0">
        {/* Top bar — hidden in print */}
        <div className="print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>

          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tax Deduction Checklist</h1>
              <p className="text-gray-500 mt-1">
                Auto-filled from your transactions + your manual entries. Expand any auto row to pick which transactions to include, then print.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={year}
                onChange={e => setYear(parseInt(e.target.value, 10))}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>
                    Tax Year {y}{savedYears.includes(y) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  dirty
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : justSaved
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : justSaved ? <Check size={14} /> : <Save size={14} />}
                {saving ? 'Saving…' : justSaved ? 'Saved' : dirty ? 'Save' : 'Up to date'}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 text-sm font-medium bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg"
              >
                <Printer size={14} />
                Print / PDF
              </button>
            </div>
          </div>
        </div>

        {/* Print header — only visible in print */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tax Deduction Checklist — Tax Year {year}</h1>
          <p className="text-sm text-gray-700 mt-1">Real Estate Agent / Broker</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
            <RefreshCw size={16} className="animate-spin" />
            Loading {year} workspace…
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 print:border-0 print:p-0 print:mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Schedule C subtotal</p>
                  <p className="text-2xl font-bold text-gray-900">${scheduleCSubtotal.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">Operating + Comms + Direct Sales + Professional + Equipment</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Home Office (pro-rata)</p>
                  <p className="text-2xl font-bold text-gray-900">${homeOfficeProRata.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">
                    {homeOfficePct > 0
                      ? `${(homeOfficePct * 100).toFixed(1)}% of home expenses + office-only repairs`
                      : 'Enter sq ft below to calculate'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Transactions loaded</p>
                  <p className="text-2xl font-bold text-gray-900">{transactions.length}</p>
                  <p className="text-xs text-gray-400">
                    From {year} statements
                    {excludedIds.size > 0 && (
                      <span className="text-amber-700 font-medium"> · {excludedIds.size} excluded</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* View toggle — Checklist (CPA-formatted) vs Curate (flat editor) */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4 max-w-md print:hidden">
              <button
                onClick={() => setView('checklist')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  view === 'checklist' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FileText size={14} />
                Checklist
              </button>
              <button
                onClick={() => setView('curate')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  view === 'curate' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <ListChecks size={14} />
                Curate transactions ({transactions.length})
              </button>
            </div>

            {/* Curate view — flat editor over all year's transactions */}
            {view === 'curate' && (() => {
              const term = curateSearch.trim().toLowerCase()
              const filtered = transactions.filter(t => {
                if (curateCategoryFilter !== 'all' && t.category !== curateCategoryFilter) return false
                if (term) {
                  const hay = `${t.description} ${t.subcategory || ''} ${t.category} ${t.source}`.toLowerCase()
                  if (!hay.includes(term)) return false
                }
                return true
              })
              // Categories present in this year's transactions, for the filter dropdown
              const yearCategories = [...new Set(transactions.map(t => t.category))].sort()
              const includedCount = filtered.filter(t => !excludedIds.has(t.id)).length

              return (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6 print:hidden">
                  <header className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">Curate {year} transactions</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Uncheck what doesn&apos;t belong on your taxes. Use the category dropdown to fix anything that landed in the wrong bucket — the checklist totals will reflect the changes.
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 shrink-0">
                        <span className="font-medium text-gray-800">{includedCount}</span> of {filtered.length} matching included
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={curateSearch}
                          onChange={e => setCurateSearch(e.target.value)}
                          placeholder="Search description, category, source…"
                          className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <select
                        value={curateCategoryFilter}
                        onChange={e => setCurateCategoryFilter(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All categories</option>
                        {yearCategories.map(c => (
                          <option key={c} value={c}>{emojiFor(c)} {c}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setManyExcluded(filtered.map(t => t.id), includedCount > 0)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 border border-gray-200 rounded-md px-2 py-1.5 flex items-center gap-1"
                      >
                        {includedCount === filtered.length ? <CheckSquare size={12} /> : <Square size={12} />}
                        {includedCount > 0 ? 'Exclude all matching' : 'Include all matching'}
                      </button>
                    </div>
                  </header>
                  <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No transactions match.</p>
                    ) : (
                      [...filtered]
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .map(t => {
                          const isExcluded = excludedIds.has(t.id)
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 ${isExcluded ? 'opacity-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={!isExcluded}
                                onChange={e => setExcluded(t.id, !e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                                <p className="text-xs text-gray-400">{t.date} · {t.source}</p>
                              </div>
                              <select
                                value={t.category}
                                onChange={e => updateTransactionCategory(t.id, e.target.value)}
                                className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 max-w-[170px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                                title="Re-categorize this transaction"
                              >
                                {pickerCategories.map(c => (
                                  <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                                ))}
                              </select>
                              <span className={`text-sm font-semibold w-20 text-right shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                {t.amount < 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                              </span>
                            </div>
                          )
                        })
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Sections */}
            <div className={`space-y-4 print:space-y-3 ${view !== 'checklist' ? 'print:block hidden' : ''}`}>
              {CHECKLIST.map((section, sectionIdx) => {
                const subtotal = sectionMoneyTotal(sectionIdx)
                return (
                  <section
                    key={section.title}
                    className="bg-white border border-gray-200 rounded-2xl overflow-hidden print:border-0 print:rounded-none print:break-inside-avoid"
                  >
                    <header className="flex items-center justify-between bg-red-900 text-white px-4 py-2.5 print:py-1">
                      <h2 className="text-base font-semibold">{section.title}</h2>
                      {SECTIONS_IN_SCHEDULE_C_TOTAL.has(section.title) && (
                        <span className="text-sm font-mono">${subtotal.toFixed(2)}</span>
                      )}
                    </header>
                    <table className="w-full text-sm">
                      <tbody>
                        {section.rows.map(row => {
                          const v = rowValueAndKind(row)
                          const isAuto = row.source.kind === 'category' || row.source.kind === 'aggregate'
                          const backingTxns = isAuto ? txnsBackingRow(row) : []
                          const includedCount = backingTxns.filter(t => !excludedIds.has(t.id)).length
                          const totalCount = backingTxns.length
                          const hasExpandable = isAuto && totalCount > 0
                          const isExpanded = expandedRows.has(row.label)
                          const allIncluded = includedCount === totalCount && totalCount > 0
                          const noneIncluded = includedCount === 0 && totalCount > 0
                          const partial = !allIncluded && !noneIncluded && totalCount > 0
                          const BulkIcon = allIncluded ? CheckSquare : noneIncluded ? Square : MinusSquare

                          return (
                            <Fragment key={row.label}>
                              <tr className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2 text-gray-800 align-top">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {hasExpandable && (
                                      <button
                                        onClick={() => toggleRowExpanded(row.label)}
                                        className="text-gray-400 hover:text-gray-700 print:hidden"
                                        title={isExpanded ? 'Collapse' : 'Pick which transactions to include'}
                                      >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                      </button>
                                    )}
                                    <span>{row.label}</span>
                                    {isAuto && (
                                      <span className="text-[10px] uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded print:hidden">
                                        auto
                                      </span>
                                    )}
                                    {hasExpandable && partial && (
                                      <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded print:hidden">
                                        {includedCount}/{totalCount} of total included
                                      </span>
                                    )}
                                  </div>
                                  {row.note && (
                                    <p className="text-xs text-gray-400 mt-0.5">{row.note}</p>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right align-top w-44">
                                  {v.kind === 'number' ? (
                                    isAuto ? (
                                      <span className="font-mono text-gray-900">
                                        {(v.value as number) > 0
                                          ? `$${(v.value as number).toFixed(2)}`
                                          : <span className="text-gray-300">—</span>}
                                      </span>
                                    ) : (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={(v.value as number) || ''}
                                        placeholder="0.00"
                                        onChange={e => {
                                          const num = parseFloat(e.target.value)
                                          const val = Number.isFinite(num) ? num : 0
                                          if (row.source.kind === 'manual') updateManual(row.source.key, val)
                                          else if (row.source.kind === 'workspace') updateWorkspacePath(row.source.path, val)
                                        }}
                                        className="w-32 text-right font-mono text-sm border border-gray-200 rounded px-2 py-1 print:border-0 print:bg-transparent print:p-0 print:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    )
                                  ) : v.kind === 'date' ? (
                                    <input
                                      type="date"
                                      value={typeof v.value === 'string' ? v.value : ''}
                                      onChange={e => {
                                        if (row.source.kind === 'workspace') updateWorkspacePath(row.source.path, e.target.value)
                                      }}
                                      className="text-sm border border-gray-200 rounded px-2 py-1 print:border-0 print:bg-transparent print:p-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={typeof v.value === 'string' ? v.value : ''}
                                      placeholder="—"
                                      onChange={e => {
                                        if (row.source.kind === 'workspace') updateWorkspacePath(row.source.path, e.target.value)
                                      }}
                                      className="w-44 text-right text-sm border border-gray-200 rounded px-2 py-1 print:border-0 print:bg-transparent print:p-0 print:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  )}
                                </td>
                              </tr>

                              {/* Expanded transaction picker (hidden in print so the
                                  print is just the curated total). */}
                              {hasExpandable && isExpanded && (
                                <tr className="print:hidden">
                                  <td colSpan={2} className="bg-gray-50 px-6 py-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-xs text-gray-500">
                                        {includedCount} of {totalCount} included · ${sumTxns(backingTxns.filter(t => !excludedIds.has(t.id))).toFixed(2)} contributing
                                      </p>
                                      <button
                                        onClick={() => setManyExcluded(backingTxns.map(t => t.id), allIncluded)}
                                        className="text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1"
                                        title={allIncluded ? 'Exclude every transaction from this row' : 'Include every transaction in this row'}
                                      >
                                        <BulkIcon size={14} />
                                        {allIncluded ? 'Exclude all' : 'Include all'}
                                      </button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 bg-white rounded-lg border border-gray-200">
                                      {[...backingTxns]
                                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                                        .map(t => {
                                          const isExcluded = excludedIds.has(t.id)
                                          return (
                                            <div
                                              key={t.id}
                                              className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                                                isExcluded ? 'opacity-50' : ''
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={!isExcluded}
                                                onChange={e => setExcluded(t.id, !e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-gray-300 shrink-0"
                                              />
                                              <span className="flex-1 truncate text-gray-800">{t.description}</span>
                                              <span className="text-gray-400 shrink-0">{t.date}</span>
                                              <select
                                                value={t.category}
                                                onChange={e => updateTransactionCategory(t.id, e.target.value)}
                                                className="text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-0.5 max-w-[140px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                title="Move this transaction to a different category (updates the totals here and on the dashboard)"
                                              >
                                                {pickerCategories.map(c => (
                                                  <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                                                ))}
                                              </select>
                                              <span className="font-mono shrink-0 text-gray-700">
                                                ${Math.abs(t.amount).toFixed(2)}
                                              </span>
                                            </div>
                                          )
                                        })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>
                )
              })}
            </div>

            {/* Footer print hint */}
            <p className="text-xs text-gray-400 mt-6 text-center print:hidden">
              Tip: in the print dialog, set Layout to Portrait and Scale to ~85% for the cleanest fit.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
