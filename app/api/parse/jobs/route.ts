import { NextRequest } from 'next/server'
import { listDoneJobs, deleteJob, updateJobTransactions, dbConfigured } from '@/lib/jobs'
import { Transaction } from '@/lib/types'

export async function GET() {
  if (!dbConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }
  const jobs = await listDoneJobs()
  return Response.json({ jobs })
}

export async function DELETE(request: NextRequest) {
  if (!dbConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return Response.json({ error: 'Missing jobId' }, { status: 400 })
  const ok = await deleteJob(jobId)
  return Response.json({ ok })
}

// Used when the user recategorizes one or more transactions in a job —
// client recomputes the full transactions array and we overwrite the jsonb.
export async function PATCH(request: NextRequest) {
  if (!dbConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return Response.json({ error: 'Missing jobId' }, { status: 400 })

  let body: { transactions?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.transactions)) {
    return Response.json({ error: 'Body must include a transactions array' }, { status: 400 })
  }

  const ok = await updateJobTransactions(jobId, body.transactions as Transaction[])
  return Response.json({ ok })
}
