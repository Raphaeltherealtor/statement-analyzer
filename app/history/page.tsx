'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Trash2, FileText, RefreshCw } from 'lucide-react'
import { Transaction } from '@/lib/types'

interface HistoryJob {
  id: string
  fileNames: string[]
  completedAt: number
  transactions: Transaction[]
  errors: { file: string; error: string }[]
}

interface YearGroup {
  year: string
  jobs: HistoryJob[]
  totalSpent: number
  txnCount: number
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<HistoryJob[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const res = await fetch('/api/parse/jobs')
        if (res.ok) {
          const data = await res.json()
          setJobs((data.jobs as HistoryJob[]) || [])
        }
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/parse/jobs?jobId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== id))
        setConfirmId(null)
      }
    } finally {
      setDeleting(null)
    }
  }

  // Group each job by the year that most of its transactions fall into.
  const yearGroups: YearGroup[] = (() => {
    const groups = new Map<string, YearGroup>()
    jobs.forEach(job => {
      const yearCounts = new Map<string, number>()
      job.transactions.forEach(t => {
        const y = t.date?.slice(0, 4)
        if (y && /^\d{4}$/.test(y)) {
          yearCounts.set(y, (yearCounts.get(y) || 0) + 1)
        }
      })
      let bestYear = 'Unknown'
      let bestCount = 0
      yearCounts.forEach((count, y) => {
        if (count > bestCount) {
          bestYear = y
          bestCount = count
        }
      })

      if (!groups.has(bestYear)) {
        groups.set(bestYear, { year: bestYear, jobs: [], totalSpent: 0, txnCount: 0 })
      }
      const g = groups.get(bestYear)!
      g.jobs.push(job)
      g.totalSpent += job.transactions
        .filter(t => t.amount > 0)
        .reduce((s, t) => s + t.amount, 0)
      g.txnCount += job.transactions.length
    })

    return Array.from(groups.values()).sort((a, b) => {
      if (a.year === 'Unknown') return 1
      if (b.year === 'Unknown') return -1
      return b.year.localeCompare(a.year)
    })
  })()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">History</h1>
          <p className="text-gray-500 mt-1">Every analysis you&apos;ve run, grouped by year. Delete what you don&apos;t need.</p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 py-8">
            <RefreshCw size={16} className="animate-spin" />
            Loading…
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <p className="text-gray-500">No analyses yet.</p>
            <Link
              href="/"
              className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Upload your first statement
            </Link>
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <div className="space-y-8">
            {yearGroups.map(group => (
              <section key={group.year}>
                <div className="flex items-end justify-between mb-3 border-b border-gray-200 pb-2">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {group.year === 'Unknown' ? 'Undated' : group.year}
                  </h2>
                  <div className="text-sm text-gray-500">
                    {group.jobs.length} analys{group.jobs.length === 1 ? 'is' : 'es'} · {group.txnCount} txns ·{' '}
                    <span className="font-medium text-gray-700">${group.totalSpent.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {group.jobs.map(job => {
                    const spent = job.transactions
                      .filter(t => t.amount > 0)
                      .reduce((s, t) => s + t.amount, 0)
                    const isConfirming = confirmId === job.id

                    return (
                      <div
                        key={job.id}
                        className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <FileText size={16} className="text-blue-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 break-words">
                                {job.fileNames.join(', ')}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(job.completedAt).toLocaleString()} ·{' '}
                                {job.transactions.length} transactions ·{' '}
                                <span className="font-medium text-gray-700">${spent.toFixed(2)}</span> spent
                                {job.errors.length > 0 && (
                                  <span className="text-amber-600"> · {job.errors.length} parse warning{job.errors.length === 1 ? '' : 's'}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        {isConfirming ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleDelete(job.id)}
                              disabled={deleting === job.id}
                              className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 px-3 py-1.5 rounded-lg"
                            >
                              {deleting === job.id ? 'Deleting…' : 'Confirm delete'}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(job.id)}
                            className="text-gray-400 hover:text-red-600 shrink-0 p-1.5 rounded-md hover:bg-red-50"
                            title="Delete this analysis"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
