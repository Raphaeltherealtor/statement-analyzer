'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Download, Pencil } from 'lucide-react'
import { Category, Transaction } from '@/lib/types'

interface CategoryCardProps {
  category: Category
  onEditTransaction?: (txn: Transaction) => void
}

export default function CategoryCard({
  category,
  onEditTransaction,
}: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'name'>('date')
  const [filterText, setFilterText] = useState('')

  const sorted = [...category.transactions]
    .filter(t =>
      !filterText ||
      t.description.toLowerCase().includes(filterText.toLowerCase()) ||
      (t.subcategory || '').toLowerCase().includes(filterText.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'amount') return b.amount - a.amount
      if (sortBy === 'name') return a.description.localeCompare(b.description)
      return (a.date || '').localeCompare(b.date || '')
    })

  // Group by merchant/subcategory for summary view
  const merchantTotals = category.transactions.reduce<Record<string, { total: number; count: number }>>((acc, t) => {
    const key = t.subcategory || t.description
    if (!acc[key]) acc[key] = { total: 0, count: 0 }
    acc[key].total += t.amount
    acc[key].count += 1
    return acc
  }, {})

  const topMerchants = Object.entries(merchantTotals)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Category', 'Source'],
      ...category.transactions.map(t => [t.date, t.description, t.amount.toFixed(2), t.category, t.source]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${category.name.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl">{category.emoji}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{category.name}</h3>
            <p className="text-sm text-gray-500">
              {category.count} transaction{category.count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900">${category.total.toFixed(2)}</p>
            {topMerchants.length > 0 && !expanded && (
              <p className="text-xs text-gray-400">
                Top: {topMerchants[0][0].slice(0, 20)}
              </p>
            )}
          </div>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Merchant breakdown */}
          {topMerchants.length > 1 && (
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top Merchants</p>
              <div className="space-y-1">
                {topMerchants.map(([name, { total, count }]) => (
                  <div key={name} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 truncate max-w-[60%]">{name}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">${total.toFixed(2)}</span>
                      <span className="text-gray-400 ml-2">×{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="px-5 py-3 flex gap-2 items-center border-b border-gray-100">
            <input
              type="text"
              placeholder="Filter..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={e => e.stopPropagation()}
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'date' | 'amount' | 'name')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
              onClick={e => e.stopPropagation()}
            >
              <option value="date">Sort: Date</option>
              <option value="amount">Sort: Amount</option>
              <option value="name">Sort: Name</option>
            </select>
            <button
              onClick={e => { e.stopPropagation(); exportCSV() }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5"
            >
              <Download size={14} />
              CSV
            </button>
          </div>

          {/* Transaction list */}
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {sorted.map(t => (
              <div
                key={t.id}
                className="px-5 py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.description}</p>
                  <div className="flex gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">{t.date}</p>
                    {t.subcategory && t.subcategory !== t.description && (
                      <p className="text-xs text-blue-500">{t.subcategory}</p>
                    )}
                    <p className="text-xs text-gray-300">{t.source}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                  {t.amount < 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                </span>
                {onEditTransaction && (
                  <button
                    onClick={e => { e.stopPropagation(); onEditTransaction(t) }}
                    className="text-gray-300 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 shrink-0"
                    title="Move to a different category"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
            {sorted.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">No transactions match filter</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
