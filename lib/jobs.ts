import { put, head } from '@vercel/blob'
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

const path = (id: string) => `jobs/${id}.json`

export async function writeJob(id: string, data: JobStatus): Promise<void> {
  await put(path(id), JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export async function readJob(id: string): Promise<JobStatus | null> {
  try {
    const meta = await head(path(id))
    // cache: 'no-store' so polling never sees a stale CDN copy
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as JobStatus
  } catch {
    return null
  }
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}
