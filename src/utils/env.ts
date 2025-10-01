export function isTauri(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window as any).__TAURI__
  } catch {
    return false
  }
}