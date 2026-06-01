export interface Transaction {
  id: string
  date: string
  description: string
  amount: number // positive = expense, negative = credit/refund
  category: string
  subcategory?: string
  source: string // filename it came from
  rawText?: string
  confidence?: number // 0-1, from AI
  needsReview?: boolean
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

export interface MerchantRule {
  normalizedMerchant: string // e.g. "starbucks"
  category: string
  displayName: string // human-friendly e.g. "Starbucks"
  createdAt: number
}

export interface CustomCategory {
  name: string
  emoji: string
}

export const DEFAULT_CATEGORY_EMOJIS: Record<string, string> = {
  'Gas & Fuel': '⛽',
  'Groceries': '🛒',
  'Fast Food': '🍟',
  'Restaurants': '🍽️',
  'Coffee Shops': '☕',
  'Bars & Alcohol': '🍺',
  'Food Delivery': '🛵',
  'Amazon': '📦',
  'Shopping & Retail': '🛍️',
  'Travel': '✈️',
  'Rideshare & Taxi': '🚕',
  'Entertainment': '🎬',
  'Streaming & Subscriptions': '📺',
  'Medical & Health': '🏥',
  'Pharmacy': '💊',
  'Utilities': '💡',
  'Phone & Internet': '📱',
  'Software & SaaS': '💻',
  'Insurance': '🛡️',
  'Income & Deposits': '💰',
  'Transfers': '🔄',
  'Automotive': '🚗',
  'Home & Garden': '🏠',
  'Education': '📚',
  'Clothing': '👕',
  'Pets': '🐾',
  'Charity & Donations': '❤️',
  'Office & Business': '💼',
  'Cash & ATM': '💵',
  'Fees & Interest': '💸',
  'Taxes & Government': '🏛️',
  'Other': '📌',
  'Uncategorized': '❓',
}

export const DEFAULT_CATEGORIES = Object.keys(DEFAULT_CATEGORY_EMOJIS)

// Categories where transactions might be tax-deductible for the average user.
// (Heuristic only — used to show a banner total, not as tax advice.)
export const POTENTIALLY_DEDUCTIBLE = [
  'Gas & Fuel',
  'Medical & Health',
  'Pharmacy',
  'Education',
  'Home & Garden',
  'Charity & Donations',
  'Office & Business',
  'Software & SaaS',
  'Phone & Internet',
  'Automotive',
]
