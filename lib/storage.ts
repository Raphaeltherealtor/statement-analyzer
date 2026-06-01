import { CustomCategory, MerchantRule } from './types'

const CUSTOM_CATEGORIES_KEY = 'sa-custom-categories-v1'
const MERCHANT_RULES_KEY = 'sa-merchant-rules-v1'
const ACTIVE_JOB_KEY = 'sa-active-job-v1'

export interface ActiveJob {
  jobId: string
  fileNames: string[]
  startedAt: number
}

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

export function loadActiveJob(): ActiveJob | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.jobId === 'string') return parsed as ActiveJob
    return null
  } catch {
    return null
  }
}

export function saveActiveJob(job: ActiveJob | null): void {
  if (typeof window === 'undefined') return
  if (job) localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job))
  else localStorage.removeItem(ACTIVE_JOB_KEY)
}
