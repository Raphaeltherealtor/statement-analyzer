import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

// Single-user auth for a personal tool. A session is a stateless, signed JWT
// (HS256) stored in an HttpOnly cookie. jose is Edge-compatible, so the same
// verify path works inside `proxy.ts` and in route handlers.

export const SESSION_COOKIE = 'session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

// The one identity this app grants. The password itself is never stored in the
// token — only the fact that the holder proved they knew it.
const SUBJECT = 'owner'

function getKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET
  // Refuse to sign/verify with a weak or missing secret. Without this guard an
  // undefined secret would encode the literal string "undefined" as the key,
  // which anyone could forge against.
  if (!secret || secret.length < 16) return null
  return new TextEncoder().encode(secret)
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD) && getKey() !== null
}

export async function createSessionToken(): Promise<string | null> {
  const key = getKey()
  if (!key) return null
  return new SignJWT({ sub: SUBJECT })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key)
}

export async function verifySession(
  token: string | undefined,
): Promise<JWTPayload | null> {
  const key = getKey()
  if (!key || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    return payload.sub === SUBJECT ? payload : null
  } catch {
    return null
  }
}

// Constant-time comparison so the response time doesn't leak how many leading
// characters of a guess were correct.
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) return false
  const enc = new TextEncoder()
  const a = enc.encode(candidate)
  const b = enc.encode(expected)
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS
