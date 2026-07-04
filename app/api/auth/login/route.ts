import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isAuthConfigured,
  passwordMatches,
} from '@/lib/session'

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Login is not configured. Set APP_PASSWORD and SESSION_SECRET (16+ chars) in the Vercel project env vars.',
      },
      { status: 503 },
    )
  }

  let password = ''
  try {
    const body = await req.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    // fall through to the invalid-credentials response
  }

  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const token = await createSessionToken()
  if (!token) {
    return NextResponse.json(
      { error: 'Could not create a session. Check SESSION_SECRET.' },
      { status: 503 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
