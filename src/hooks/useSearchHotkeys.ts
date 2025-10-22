import { useEffect } from 'react'
import type { PageKey } from '../types'

// 全局快捷键已完全移除（不再注册任何键盘事件）
export default function useSearchHotkeys(
  setPage: (p: PageKey) => void,
  searchInputRef: React.RefObject<HTMLInputElement>
) {
  useEffect(() => {
    // no-op: shortcuts removed
  }, [setPage, searchInputRef])
}