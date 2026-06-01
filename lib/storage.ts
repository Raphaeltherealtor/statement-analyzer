import { CustomCategory, MerchantRule } from './types'

const CUSTOM_CATEGORIES_KEY = 'sa-custom-categories-v1'
const MERCHANT_RULES_KEY = 'sa-merchant-rules-v1'

export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomCategories(cats: CustomCategory[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats))
}

export function loadMerchantRules(): MerchantRule[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MERCHANT_RULES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveMerchantRules(rules: MerchantRule[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(MERCHANT_RULES_KEY, JSON.stringify(rules))
}
