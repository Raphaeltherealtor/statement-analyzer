'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

export default function ServiceWorkerRegistration() {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(console.error)
    }

    // Capture the beforeinstallprompt event (Chrome/Android)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Detect iOS and not already installed
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isIOS && !isStandalone) {
      setShowIOSHint(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (installPrompt as any).prompt()
    setInstallPrompt(null)
  }

  if (dismissed) return null

  // Chrome/Android install button
  if (installPrompt) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 border border-green-500/40 text-white px-4 py-3 rounded-2xl shadow-xl text-sm">
        <Download size={16} className="text-green-400 shrink-0" />
        <span>Install Statement Analyzer as an app</span>
        <button
          onClick={handleInstall}
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-3 py-1 rounded-lg text-xs"
        >
          Install
        </button>
        <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-white ml-1">
          <X size={14} />
        </button>
      </div>
    )
  }

  // iOS hint
  if (showIOSHint) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-gray-900 border border-green-500/40 text-white px-4 py-3 rounded-2xl shadow-xl text-sm text-center">
        <p className="font-medium mb-1">Install on iPhone</p>
        <p className="text-gray-400 text-xs">
          Tap the Share button <span className="text-white">⎋</span> then &ldquo;Add to Home Screen&rdquo; <span className="text-white">➕</span>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-3 text-gray-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return null
}
