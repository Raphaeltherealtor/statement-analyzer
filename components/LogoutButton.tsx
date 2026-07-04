'use client'

import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  const pathname = usePathname()

  // No logout affordance on the login screen itself.
  if (pathname === '/login') return null

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      // Full navigation so the proxy re-runs and bounces to /login.
      window.location.assign('/login')
    }
  }

  return (
    <button
      onClick={handleLogout}
      title="Log out"
      aria-label="Log out"
      className="fixed top-3 right-3 z-[60] flex items-center gap-1.5 rounded-full bg-gray-900/80 hover:bg-gray-800 border border-white/10 text-gray-300 hover:text-white px-3 py-1.5 text-xs backdrop-blur transition-colors"
    >
      <LogOut size={14} />
      <span className="hidden sm:inline">Log out</span>
    </button>
  )
}
