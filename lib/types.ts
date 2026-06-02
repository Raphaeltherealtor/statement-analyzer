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
  // Real-estate / professional-services-specific buckets. Detailed enough
  // that a tax preparer can map each one to a clean Schedule C line.
  'Marketing & Advertising': '📣',
  'MLS & Association Dues': '🏘️',
  'Brokerage Fees': '🏢',
  'Lockboxes & Showings': '🔐',
  'Client Gifts & Closing': '🎁',
  'Website & Hosting': '🌐',
  'Photography & Video': '📸',
  'Continuing Education': '🎓',
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
  'Continuing Education',
  'Home & Garden',
  'Charity & Donations',
  'Office & Business',
  'Software & SaaS',
  'Phone & Internet',
  'Automotive',
  'Marketing & Advertising',
  'MLS & Association Dues',
  'Brokerage Fees',
  'Lockboxes & Showings',
  'Client Gifts & Closing',
  'Website & Hosting',
  'Photography & Video',
  'Insurance',
]

// Maps each app category to the Schedule C (1040) line item a tax preparer
// would typically file it under for a self-employed person. Categories that
// are usually personal map to "Personal — not deductible". Schedule A
// itemized categories (medical, charity) are flagged separately.
//
// This is OPINIONATED and intended as a starting point for a tax preparer
// to review — not tax advice. Mixed business/personal use is common; the
// preparer makes the call.
export const TAX_LINE: Record<string, string> = {
  // Schedule C — vehicle
  'Gas & Fuel': 'Car and Truck Expenses (line 9)',
  'Automotive': 'Car and Truck Expenses (line 9)',

  // Schedule C — travel & meals
  'Rideshare & Taxi': 'Travel (line 24a)',
  'Travel': 'Travel (line 24a)',
  'Restaurants': 'Meals 50% (line 24b)',
  'Fast Food': 'Meals 50% (line 24b)',
  'Coffee Shops': 'Meals 50% (line 24b)',
  'Bars & Alcohol': 'Meals 50% (line 24b)',
  'Food Delivery': 'Meals 50% (line 24b)',

  // Schedule C — real estate / professional-services-specific
  'Marketing & Advertising': 'Advertising (line 8)',
  'Website & Hosting': 'Advertising (line 8)',
  'Photography & Video': 'Advertising (line 8)',
  'Client Gifts & Closing': 'Other — Client Gifts ($25/person cap)',
  'MLS & Association Dues': 'Dues & Subscriptions (line 27a)',
  'Brokerage Fees': 'Commissions & Fees (line 10)',
  'Lockboxes & Showings': 'Other — Real Estate Operations',
  'Continuing Education': 'Other — Continuing Education',

  // Schedule C — office / overhead
  'Office & Business': 'Office Expense (line 18)',
  'Software & SaaS': 'Office Expense (line 18)',
  'Phone & Internet': 'Utilities — business % (line 25)',
  'Utilities': 'Utilities — home office % (line 25)',
  'Insurance': 'Insurance (line 15)',
  'Education': 'Other — Professional Development',
  'Home & Garden': 'Repairs and Maintenance (line 21)',
  'Fees & Interest': 'Interest / Bank Fees (line 16b/27a)',
  'Amazon': 'Office Expense — review per item',

  // Schedule A (itemized)
  'Medical & Health': 'Schedule A — Medical',
  'Pharmacy': 'Schedule A — Medical',
  'Charity & Donations': 'Schedule A — Charitable',
  'Taxes & Government': 'Schedule A — State/Local Taxes',

  // Income
  'Income & Deposits': 'Income (1099)',

  // Typically personal
  'Groceries': 'Personal — not deductible',
  'Shopping & Retail': 'Personal — not deductible',
  'Entertainment': 'Personal — not deductible',
  'Streaming & Subscriptions': 'Personal — not deductible',
  'Clothing': 'Personal — not deductible',
  'Pets': 'Personal — not deductible',
  'Cash & ATM': 'Cash — review',
  'Transfers': 'Transfer — exclude',
  'Other': 'Review',
  'Uncategorized': 'Review',
}
