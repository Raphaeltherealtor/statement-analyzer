'use client'

import { useState } from 'react'
import { AlertCircle, RefreshCw, Download, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react'
import UploadZone from '@/components/UploadZone'
import CategoryCard from '@/components/CategoryCard'
import { Transaction, Category, CATEGORY_EMOJIS } from '@/lib/types'

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [errors, setErrors] = useState<{ file: string; error: string }[]>([])
  const [processedFiles, setProcessedFiles] = useState<string[]>([])
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const handleUpload = async (files: File[]) => {
    setIsProcessing(true)
    setErrors([])

    const formData = new FormData()
    files.forEach(f => formData.append('files', f))

    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.error) {
        setErrors([{ file: 'All files', error: data.error }])
        return
      }

      setTransactions(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        const newOnes = (data.transactions as Transaction[]).filter(t => !existingIds.has(t.id))
        return [...prev, ...newOnes]
      })

      setProcessedFiles(prev => [...new Set([...prev, ...files.map(f => f.name)])])

      if (data.errors?.length > 0) {
        setErrors(data.errors)
      }
    } catch {
      setErrors([{ file: 'Request', error: 'Failed to connect to server' }])
    } finally {
      setIsProcessing(false)
    }
  }

  const clearAll = () => {
    setTransactions([])
    setErrors([])
    setProcessedFiles([])
    setYearFilter('all')
    setCategoryFilter('all')
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
        emoji: CATEGORY_EMOJIS[t.category] || '📌',
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
    .filter(c => ['Gas & Fuel', 'Medical & Health', 'Education', 'Home & Garden'].includes(c.name))
    .reduce((s, c) => s + c.total, 0)

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Statement Analyzer</h1>
          <p className="text-gray-500 mt-1">Upload bank statements & Amazon orders — AI categorizes everything for taxes</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <UploadZone onUpload={handleUpload} isProcessing={isProcessing} />

          {isProcessing && (
            <div className="mt-4 flex items-center gap-2 text-blue-600">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Reading files and categorizing with AI... this may take a minute.</span>
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
            <div className="grid grid-cols-3 gap-4 mb-6">
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
                <p className="text-xs text-gray-400 mt-1">Gas, Medical, Education, Home</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
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
    </div>
  )
}
