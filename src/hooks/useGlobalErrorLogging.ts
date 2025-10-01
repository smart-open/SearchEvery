import { useEffect } from 'react'
import { logError } from '../services/logging'

export default function useGlobalErrorLogging() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logError(event.error ?? event.message, 'window.onerror')
    }
    const onUnhandled = (event: PromiseRejectionEvent) => {
      logError(event.reason, 'window.onunhandledrejection')
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [])
}