import { NextRequest } from 'next/server'
import {
  loadWorkspace,
  saveWorkspace,
  listWorkspaceYears,
  workspaceConfigured,
  WorkspaceData,
} from '@/lib/tax-workspace'

function parseYear(value: string | null): number | null {
  if (!value) return null
  const y = parseInt(value, 10)
  if (!Number.isFinite(y) || y < 1990 || y > 2100) return null
  return y
}

export async function GET(request: NextRequest) {
  if (!workspaceConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  if (searchParams.get('list') === '1') {
    const years = await listWorkspaceYears()
    return Response.json({ years })
  }

  const year = parseYear(searchParams.get('year'))
  if (!year) return Response.json({ error: 'Missing or invalid year' }, { status: 400 })

  const workspace = await loadWorkspace(year)
  return Response.json({ workspace: workspace || {} })
}

export async function PUT(request: NextRequest) {
  if (!workspaceConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseYear(searchParams.get('year'))
  if (!year) return Response.json({ error: 'Missing or invalid year' }, { status: 400 })

  let body: { data?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.data !== 'object' || body.data === null) {
    return Response.json({ error: 'Body must include a data object' }, { status: 400 })
  }

  const ok = await saveWorkspace(year, body.data as WorkspaceData)
  return Response.json({ ok })
}
