import { NextRequest } from 'next/server'
import { readJob, dbConfigured } from '@/lib/jobs'

export async function GET(request: NextRequest) {
  if (!dbConfigured()) {
    return Response.json(
      { error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project env vars.' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return Response.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await readJob(jobId)
  if (!job) return Response.json({ status: 'missing', error: 'Job not found or expired' }, { status: 404 })

  return Response.json(job)
}
