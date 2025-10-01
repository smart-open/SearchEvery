export function formatTs(ts?: number): string {
  // 后端传入的是 Unix 秒级时间戳，需要转换为毫秒
  if (ts == null || !Number.isFinite(ts)) return '-'
  try {
    const ms = ts * 1000
    return new Date(ms).toLocaleString()
  } catch {
    return '-'
  }
}

export function formatRelativeTs(ts?: number): string {
  if (ts == null || !Number.isFinite(ts)) return '-'
  try {
    const ms = ts * 1000
    const now = Date.now()
    const diffMs = now - ms
    if (diffMs < 0) return formatTs(ts)
    const sec = Math.floor(diffMs / 1000)
    if (sec < 5) return '刚刚'
    if (sec < 60) return `${sec} 秒前`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} 分钟前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} 小时前`
    const day = Math.floor(hr / 24)
    if (day < 30) return `${day} 天前`
    // 超过 30 天，显示绝对时间
    return formatTs(ts)
  } catch {
    return '-'
  }
}