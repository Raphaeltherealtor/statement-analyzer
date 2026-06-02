'use client'

import { useState } from 'react'

interface MoneyInputProps {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  // Visually highlight that this input is currently storing an override
  // (used by the tax-checklist's auto rows when the user has typed in
  // a value that wins over the computed sum).
  overridden?: boolean
  disabled?: boolean
}

// Format a number as US money with commas — "1234.5" -> "1,234.50".
function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Strip everything but digits, decimal points, and a leading minus sign
// so the user can paste "$1,234.56" without having to clean it up first.
function parseMoney(text: string): number {
  if (!text) return 0
  const cleaned = text.replace(/[^\d.-]/g, '')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

export default function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  ariaLabel,
  overridden = false,
  disabled = false,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  // While focused, hold raw text so the user can type freely. While blurred,
  // the input renders the canonical formatted value.
  const [draft, setDraft] = useState('')

  const displayValue = focused ? draft : formatMoney(value)

  return (
    <div className="relative inline-block w-full">
      <span
        className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm pointer-events-none select-none ${
          overridden ? 'text-amber-500' : 'text-gray-400'
        } print:left-0 print:text-gray-700`}
      >
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setFocused(true)
          // Seed draft with the unformatted value so the user can edit cleanly
          // (no commas to delete past).
          setDraft(value && Number.isFinite(value) ? String(value) : '')
        }}
        onBlur={() => setFocused(false)}
        onChange={e => {
          const text = e.target.value
          setDraft(text)
          onChange(parseMoney(text))
        }}
        className={`pl-5 ${className} ${
          overridden ? 'text-amber-700' : ''
        }`}
      />
    </div>
  )
}
