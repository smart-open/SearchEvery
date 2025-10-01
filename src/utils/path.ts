// 缩短过长路径用于 UI 展示，尽量保留盘符/根与最后的文件名
export function shortenPath(p: string, maxLen = 80): string {
  if (!p) return ''
  if (p.length <= maxLen) return p
  const useBackslash = p.includes('\\')
  const sep = useBackslash ? '\\' : '/'
  const parts = p.split(/[\\/]/)
  if (parts.length <= 2) {
    return p.slice(0, maxLen - 3) + '...'
  }
  const first = parts[0] // 可能是盘符或根
  const last = parts[parts.length - 1]
  const beforeLast = parts[parts.length - 2]
  let candidate = `${first}${sep}...${sep}${beforeLast}${sep}${last}`
  if (candidate.length <= maxLen) return candidate
  // 如果仍然超长，则按长度对原始字符串进行居中省略
  const keep = maxLen - 3
  const head = Math.max(10, Math.floor(keep / 2))
  const tail = keep - head
  return p.slice(0, head) + '...' + p.slice(p.length - tail)
}