// 字节单位格式化与转换工具
export function formatBytes(bytes: number, opts?: {
  digitsB?: number
  digitsKB?: number
  digitsMB?: number
  digitsGB?: number
  digitsTB?: number
}): string {
  if (!Number.isFinite(bytes)) return '-'
  const cfg = {
    digitsB: opts?.digitsB ?? 0,
    digitsKB: opts?.digitsKB ?? 0,
    digitsMB: opts?.digitsMB ?? 2,
    digitsGB: opts?.digitsGB ?? 2,
    digitsTB: opts?.digitsTB ?? 2,
  }
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let idx = 0
  let val = abs / 1024
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx++
  }
  const unit = units[idx]
  const digits = unit === 'KB' ? cfg.digitsKB : unit === 'MB' ? cfg.digitsMB : unit === 'GB' ? cfg.digitsGB : cfg.digitsTB
  const sign = bytes < 0 ? '-' : ''
  return `${sign}${val.toFixed(digits)} ${unit}`
}

// 将 MB 值转换为字节
export function toBytesMb(mb: number): number {
  return Math.round(mb * 1024 * 1024)
}