export interface Transaction {
  id: string
  date: string
  description: string
  amount: number // positive = expense, negative = credit/refund
  category: string
  subcategory?: string
  source: string // filename it came from
  rawText?: string
}

export interface Category {
  name: string
  emoji: string
  total: number
  count: number
  transactions: Transaction[]
}

export interface ParseResult {
  transactions: Transaction[]
  sourceFile: string
  error?: string
}

export const CATEGORY_EMOJIS: Record<string, string> = {
  'Gas & Fuel': '⛽',
  'Groceries': '🛒',
  'Restaurants & Dining': '🍔',
  'Amazon': '📦',
  'Shopping & Retail': '🛍️',
  'Travel': '✈️',
  'Entertainment': '🎬',
  'Medical & Health': '🏥',
  'Utilities': '💡',
  'Subscriptions & Software': '💻',
  'Insurance': '🛡️',
  'Income & Deposits': '💰',
  'Transfers': '🔄',
  'Automotive': '🚗',
  'Home & Garden': '🏠',
  'Education': '📚',
  'Clothing': '👕',
  'Other': '📌',
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_EMOJIS)
