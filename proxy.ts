import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

// Paths reachable without a session: the login screen and the auth endpoints
// that establish/clear it. Everything else — pages and API routes alike — is
// gated, so bank-statement data is never served to an unauthenticated caller.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  const authed = session !== null

  if (isPublic(pathname)) {
    // Already logged in and landing on /login? Send them into the app.
    if (authed && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.nextUrl))
    }
    return NextResponse.next()
  }

  if (!authed) {
    // API callers get a clean 401 instead of an HTML redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.nextUrl)
    if (pathname !== '/') loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on everything except Next internals, the PWA service worker/manifest,
  // and static image assets — none of which are sensitive.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|ico|svg|jpg|jpeg|webp)$).*)',
  ],
}
