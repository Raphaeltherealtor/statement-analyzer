'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

function LoginForm() {
  const params = useSearchParams()
  const from = params.get('from') || '/'
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        // Full navigation so the proxy re-runs with the new cookie.
        window.location.assign(from)
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Login failed.')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-full flex-1 flex items-center justify-center px-4 bg-gray-950 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-green-500/15 border border-green-500/40 flex items-center justify-center mb-3">
            <Lock size={22} className="text-green-400" />
          </div>
          <h1 className="text-lg font-semibold">Statement Analyzer</h1>
          <p className="text-sm text-gray-400 mt-1">Enter your password to continue.</p>
        </div>

        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl bg-gray-950 border border-white/10 px-4 py-3 text-sm outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/40"
        />

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold px-4 py-3 text-sm transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
