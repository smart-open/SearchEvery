import { invoke } from '@tauri-apps/api/tauri'
import type { AppConfig, FileMeta, SearchResult, SearchRequest, DiagnosticsReport, DupGroup } from '../types'
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
  // 后端期望字段为 snake_case：index_dir、enable_content_parse
  const rustOpts = { index_dir: opts.indexDir, enable_content_parse: opts.enable_content_parse }
  await safeInvoke('build_inverted_index', { files, opts: rustOpts }, { timeoutMs: INVOKE_TIMEOUTS.buildIndex })
}

export async function buildInvertedIndexProgress(files: FileMeta[], opts: { indexDir: string; enable_content_parse: boolean }): Promise<void> {
  const rustOpts = { index_dir: opts.indexDir, enable_content_parse: opts.enable_content_parse }
  await safeInvoke('build_inverted_index_progress', { files, opts: rustOpts }, { timeoutMs: INVOKE_TIMEOUTS.buildIndex })
}

// 合并：扫描并索引（后台事件驱动）
export async function scanAndIndexPipeline(opts: { roots: string[]; exclude_patterns: string[] }, indexOpts: { indexDir: string; enable_content_parse: boolean }): Promise<void> {
  const rustIndexOpts = { index_dir: indexOpts.indexDir, enable_content_parse: indexOpts.enable_content_parse }
  // 为兼容可能的参数命名差异，同时发送 index_opts 与 indexOpts
  const payload = { opts: { roots: opts.roots, exclude_patterns: opts.exclude_patterns, max_file_size_mb: 500, follow_symlinks: false }, index_opts: rustIndexOpts, indexOpts: rustIndexOpts }
  // 可选调试：查看实际发送的负载结构
  // console.debug('scan_and_index_pipeline payload', payload)
  await safeInvoke('scan_and_index_pipeline', payload, { timeoutMs: INVOKE_TIMEOUTS.pipelineStart })
}

// 立即触发自动扫描（由后端根据系统空闲条件执行）
export async function startAutoScanNow(): Promise<void> {
  await safeInvoke('start_auto_scan_now', undefined, { timeoutMs: INVOKE_TIMEOUTS.startAutoScanNow })
}

// 查询
export async function searchQuery(req: SearchRequest): Promise<SearchResult[]> {
  // Rust 端期望字段为 snake_case：index_dir；filters 的字段同样为 ext/min_size/max_size
  const rustReq = {
    query: req.query,
    filters: req.filters ? {
      ext: req.filters.ext,
      min_size: req.filters.min_size,
      max_size: req.filters.max_size,
    } : null,
    index_dir: req.indexDir,
  }
  return safeInvoke<SearchResult[]>('search_query', { req: rustReq }, { timeoutMs: INVOKE_TIMEOUTS.searchQuery, retries: 1 })
}

// 打开文件所在位置
export async function openLocation(path: string): Promise<void> {
  await safeInvoke('open_location', { path }, { timeoutMs: INVOKE_TIMEOUTS.openLocation })
}

// 检测重复文件（按内容哈希与文件名）
export async function detectDuplicates(paths: string[]): Promise<DupGroup[]> {
  return safeInvoke<DupGroup[]>('detect_duplicates', { paths }, { timeoutMs: INVOKE_TIMEOUTS.searchQuery })
}

// 删除重复文件：删除磁盘文件并移除索引记录
export async function deleteFileAndIndex(path: string, indexDir: string): Promise<void> {
  await safeInvoke('delete_file_and_index', { path, index_dir: indexDir, indexDir }, { timeoutMs: INVOKE_TIMEOUTS.buildIndex })
}

// 诊断报告
export async function diagnosticsReport(): Promise<DiagnosticsReport> {
  return safeInvoke<DiagnosticsReport>('diagnostics_report', undefined, { timeoutMs: INVOKE_TIMEOUTS.diagnosticsReport })
}