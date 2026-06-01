import { NextRequest } from 'next/server'
import { listDoneJobs, deleteJob, dbConfigured } from '@/lib/jobs'

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
