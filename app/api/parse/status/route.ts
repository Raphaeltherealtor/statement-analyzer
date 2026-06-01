import { NextRequest } from 'next/server'
import { readJob, blobConfigured } from '@/lib/jobs'

export async function GET(request: NextRequest) {
  if (!blobConfigured()) {
    return Response.json(
      { error: 'Vercel Blob is not enabled. Connect Blob storage in the Vercel dashboard.' },
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
