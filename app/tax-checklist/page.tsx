'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Save, RefreshCw, Check } from 'lucide-react'
import { CHECKLIST, ChecklistRow, SECTIONS_IN_SCHEDULE_C_TOTAL } from '@/lib/checklist-template'
import { WorkspaceData } from '@/lib/tax-workspace'
import { Transaction } from '@/lib/types'

const NOW_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [NOW_YEAR + 1, NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2, NOW_YEAR - 3]

// Sum of selected categories' transactions for the active year. Amounts are
// stored signed (positive = expense, negative = income); we sum absolute
// values so income categories (Income & Deposits) and expense categories
// both render as positive totals.
function sumCategories(txns: Transaction[], categories: string[]): number {
  const set = new Set(categories)
  return txns
    .filter(t => set.has(t.category))
    .reduce((s, t) => s + Math.abs(t.amount), 0)
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

export default function TaxChecklistPage() {
  const [year, setYear] = useState<number>(NOW_YEAR)
  const [workspace, setWorkspace] = useState<WorkspaceData>({})
  const [savedYears, setSavedYears] = useState<number[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

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

        const allTxns: Transaction[] = ((txnsData.jobs as Array<{ transactions?: Transaction[] }>) || [])
          .flatMap(j => j.transactions || [])
        const yearStr = String(year)
        setTransactions(allTxns.filter(t => t.date?.startsWith(yearStr)))

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

  const rowValueAndKind = (row: ChecklistRow): RowValue => {
    const s = row.source
    if (s.kind === 'category') {
      return { kind: 'number', value: sumCategories(transactions, [s.category]) }
    }
    if (s.kind === 'aggregate') {
      return { kind: 'number', value: sumCategories(transactions, s.categories) }
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
                Auto-filled from your transactions + your manual entries. Print or save as PDF to send to your CPA.
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
                  <p className="text-xs text-gray-400">From {year} statements</p>
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4 print:space-y-3">
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
                          return (
                            <tr key={row.label} className="border-b border-gray-100 last:border-0">
                              <td className="px-4 py-2 text-gray-800 align-top">
                                <div className="flex items-center gap-2">
                                  <span>{row.label}</span>
                                  {isAuto && (
                                    <span className="text-[10px] uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded print:hidden">
                                      auto
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
