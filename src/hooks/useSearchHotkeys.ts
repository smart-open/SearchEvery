import { useEffect } from 'react'
import type { PageKey } from '../types'

// 注册全局快捷键：Ctrl/Cmd+K / Ctrl/Cmd+F 聚焦搜索框并切换到搜索页
export default function useSearchHotkeys(
  setPage: (p: PageKey) => void,
  searchInputRef: React.RefObject<HTMLInputElement>
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'f')) {
        e.preventDefault()
        setPage('search')
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPage, searchInputRef])
}