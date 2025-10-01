import { invoke } from '@tauri-apps/api/tauri'
import type { AppConfig, FileMeta, SearchResult, SearchRequest } from '../types'
import { INVOKE_DEFAULTS, INVOKE_TIMEOUTS } from '../constants/runtime'

type InvokeOptions = { timeoutMs?: number; retries?: number }

async function safeInvoke<T>(cmd: string, payload: any, opts: InvokeOptions = {}): Promise<T> {
  const { timeoutMs = INVOKE_DEFAULTS.timeoutMs, retries = INVOKE_DEFAULTS.retries } = opts
  let attempt = 0
  let lastErr: any
  while (attempt <= retries) {
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`invoke ${cmd} timeout after ${timeoutMs}ms`)), timeoutMs))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const call = invoke<T>(cmd, payload)
      // race timeout vs invoke
      // @ts-expect-error union race
      const res: T = await Promise.race([call, timeout])
      return res
    } catch (e) {
      lastErr = e
      attempt++
      if (attempt > retries) break
    }
  }
  throw lastErr
}

// 读取/写入配置
export async function readConfig(): Promise<AppConfig> {
  return safeInvoke<AppConfig>('read_config', undefined, { timeoutMs: INVOKE_TIMEOUTS.readConfig })
}

export async function writeConfig(cfg: AppConfig): Promise<void> {
  await safeInvoke('write_config', { cfg }, { timeoutMs: INVOKE_TIMEOUTS.writeConfig })
}

export async function resetConfig(): Promise<AppConfig> {
  return safeInvoke<AppConfig>('reset_config', undefined, { timeoutMs: INVOKE_TIMEOUTS.readConfig })
}

// 扫描目录
export async function scanPaths(opts: {
  roots: string[]
  exclude_patterns: string[]
  max_file_size_mb: number
  follow_symlinks: boolean
}): Promise<FileMeta[]> {
  return safeInvoke<FileMeta[]>('scan_paths', { opts }, { timeoutMs: INVOKE_TIMEOUTS.scanPaths })
}

// 扫描目录（带进度事件）
export async function scanPathsProgress(opts: {
  roots: string[]
  exclude_patterns: string[]
  max_file_size_mb: number
  follow_symlinks: boolean
}): Promise<FileMeta[]> {
  return safeInvoke<FileMeta[]>('scan_paths_progress', { opts }, { timeoutMs: INVOKE_TIMEOUTS.scanPaths })
}

// 构建索引
export async function buildInvertedIndex(files: FileMeta[], opts: { indexDir: string; enable_content_parse: boolean }): Promise<void> {
  await safeInvoke('build_inverted_index', { files, opts }, { timeoutMs: INVOKE_TIMEOUTS.buildIndex })
}

export async function buildInvertedIndexProgress(files: FileMeta[], opts: { indexDir: string; enable_content_parse: boolean }): Promise<void> {
  await safeInvoke('build_inverted_index_progress', { files, opts }, { timeoutMs: INVOKE_TIMEOUTS.buildIndex })
}

// 查询
export async function searchQuery(req: SearchRequest): Promise<SearchResult[]> {
  return safeInvoke<SearchResult[]>('search_query', { req }, { timeoutMs: INVOKE_TIMEOUTS.searchQuery, retries: 1 })
}

// 打开文件所在位置
export async function openLocation(path: string): Promise<void> {
  await safeInvoke('open_location', { path }, { timeoutMs: INVOKE_TIMEOUTS.openLocation })
}