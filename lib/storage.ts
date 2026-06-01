import { CustomCategory, MerchantRule } from './types'

const CUSTOM_CATEGORIES_KEY = 'sa-custom-categories-v1'
const MERCHANT_RULES_KEY = 'sa-merchant-rules-v1'
const ACTIVE_JOBS_KEY = 'sa-active-jobs-v2'

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

export function loadActiveJobs(): ActiveJob[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ACTIVE_JOBS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (j): j is ActiveJob =>
        j && typeof j.jobId === 'string' && Array.isArray(j.fileNames)
    )
  } catch {
    return []
  }
}

export function saveActiveJobs(jobs: ActiveJob[]): void {
  if (typeof window === 'undefined') return
  if (jobs.length === 0) localStorage.removeItem(ACTIVE_JOBS_KEY)
  else localStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs))
}
