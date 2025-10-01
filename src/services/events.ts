import { listen } from '@tauri-apps/api/event'
import type { IndexProgressPayload } from '../types'

export async function onIndexProgress(handler: (payload: IndexProgressPayload) => void): Promise<() => void> {
  const unlisten = await listen('index_progress', (event) => {
    handler(event.payload as any)
  })
  return unlisten
}

export async function onIndexDone(handler: () => void): Promise<() => void> {
  const unlisten = await listen('index_done', (_event) => {
    handler()
  })
  return unlisten
}

// 通用事件订阅封装
export async function onEvent<T = any>(name: string, handler: (payload: T) => void): Promise<() => void> {
  const unlisten = await listen(name, (event) => {
    handler(event.payload as T)
  })
  return unlisten
}

// 仅订阅一次
export async function onEventOnce<T = any>(name: string, handler: (payload: T) => void): Promise<void> {
  const unlisten = await listen(name, (event) => {
    handler(event.payload as T)
    unlisten()
  })
}