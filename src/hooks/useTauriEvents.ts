import { useEffect } from 'react'

// 通用事件订阅 Hook：当 active 为 true 时，执行订阅函数并在卸载或 active 变化时取消订阅
// subscribeFns: 每个函数应返回一个 Promise，resolve 为对应的 unlisten 函数
type UseTauriEventsOptions = {
  onError?: (error: any, index: number) => void
  retries?: number
  backoffMs?: number
}

export default function useTauriEvents(
  active: boolean,
  subscribeFns: Array<() => Promise<() => void>>,
  options: UseTauriEventsOptions = {}
) {
  useEffect(() => {
    if (!active) return
    let unlisteners: Array<() => void> = []
    let cancelled = false
    const { onError, retries = 2, backoffMs = 500 } = options
    ;(async () => {
      for (let i = 0; i < subscribeFns.length; i++) {
        const fn = subscribeFns[i]
        let attempt = 0
        while (attempt <= retries) {
          try {
            const un = await fn()
            if (!cancelled) unlisteners.push(un)
            break
          } catch (e) {
            onError?.(e, i)
            attempt++
            if (attempt > retries) break
            await new Promise(res => setTimeout(res, backoffMs * Math.pow(2, attempt - 1)))
          }
        }
      }
    })()
    return () => {
      cancelled = true
      for (const un of unlisteners) {
        try { un() } catch (_) { /* ignore */ }
      }
      unlisteners = []
    }
  }, [active, subscribeFns, options.onError, options.retries, options.backoffMs])
}