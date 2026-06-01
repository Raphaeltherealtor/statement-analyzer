import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Transaction } from './types'

export type JobError = { file: string; error: string }

export type JobStatus =
  | { status: 'processing'; createdAt: number; fileNames: string[] }
  | {
      status: 'done'
      transactions: Transaction[]
      errors: JobError[]
      completedAt: number
      fileNames: string[]
    }
  | {
      status: 'error'
      message: string
      fileNames: string[]
      failedAt: number
    }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: SupabaseClient | null = null
function getClient(): SupabaseClient | null {
  if (cached) return cached
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

interface DbRow {
  id: string
  status: 'processing' | 'done' | 'error'
  file_names: string[]
  transactions: Transaction[] | null
  errors: JobError[] | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// Anything older than this that's still 'processing' is almost certainly a
// dead function (Vercel killed it past maxDuration before it could write a
// terminal state). Treat it as a failure so the client unblocks instead of
// polling forever.
const STALE_PROCESSING_MS = 90_000

function rowToStatus(row: DbRow): JobStatus {
  const fileNames = row.file_names ?? []
  if (row.status === 'processing') {
    const ageMs = Date.now() - new Date(row.created_at).getTime()
    if (ageMs > STALE_PROCESSING_MS) {
      return {
        status: 'error',
        message: 'Processing timed out — the file may be too large for the current plan limits',
        failedAt: new Date(row.updated_at).getTime(),
        fileNames,
      }
    }
    return { status: 'processing', createdAt: new Date(row.created_at).getTime(), fileNames }
  }
  if (row.status === 'done') {
    return {
      status: 'done',
      transactions: row.transactions ?? [],
      errors: row.errors ?? [],
      completedAt: new Date(row.updated_at).getTime(),
      fileNames,
    }
  }
  return {
    status: 'error',
    message: row.error_message ?? 'Job failed',
    failedAt: new Date(row.updated_at).getTime(),
    fileNames,
  }
}

export async function createJob(fileNames: string[]): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('Supabase not configured')
  const { data, error } = await client
    .from('sa_parse_jobs')
    .insert({ status: 'processing', file_names: fileNames })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function completeJob(
  id: string,
  transactions: Transaction[],
  errors: JobError[]
): Promise<void> {
  const client = getClient()
  if (!client) throw new Error('Supabase not configured')
  const { error } = await client
    .from('sa_parse_jobs')
    .update({
      status: 'done',
      transactions,
      errors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function failJob(id: string, message: string): Promise<void> {
  const client = getClient()
  if (!client) throw new Error('Supabase not configured')
  const { error } = await client
    .from('sa_parse_jobs')
    .update({
      status: 'error',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function readJob(id: string): Promise<JobStatus | null> {
  const client = getClient()
  if (!client) return null
  const { data, error } = await client
    .from('sa_parse_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return rowToStatus(data as DbRow)
}

export function dbConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}
