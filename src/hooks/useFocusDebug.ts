import { useEffect, useState } from 'react'

export default function useFocusDebug(enabled = false) {
  const [lastFocus, setLastFocus] = useState<string>('')

  useEffect(() => {
    if (!enabled) return
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null
      const desc = t ? `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}${t.className ? `.${String(t.className).split(' ').join('.')}` : ''}` : 'unknown'
      setLastFocus(desc)
      // eslint-disable-next-line no-console
      console.log('[focusin]', desc)
    }
    const onFocusOut = (e: Event) => {
      const t = e.target as HTMLElement | null
      const desc = t ? `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}${t.className ? `.${String(t.className).split(' ').join('.')}` : ''}` : 'unknown'
      // eslint-disable-next-line no-console
      console.log('[focusout]', desc)
    }
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line no-console
    console.log('[activeElement]', document.activeElement)
  })

  return { lastFocus }
}