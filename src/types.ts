export type FileMeta = {
  path: string
  file_name: string
  ext: string
  size: number
  modified_ts: number
}

export type SearchResult = {
  path: string
  name: string
  ext: string
  score: number
  size?: number
  modified_ts?: number
  summary?: string
}

export type AppConfig = {
  search_mode: string
  scan_roots: string[]
  exclude_patterns: string[]
  index_dir: string
  // UI 配置：路径显示最大长度（用于 shortenPath）
  path_max_len?: number
  // 是否启用每日自动扫描（系统空闲时）
  auto_scan_enabled?: boolean
}

export type PageKey = 'search' | 'index' | 'dup' | 'settings' | 'about'

export type ThemeKey = 'light' | 'dark' | 'eye' | 'tech' | 'sky' | 'purple' | 'gray'

// 重复文件分组
export type DupGroup = {
  kind: 'hash' | 'name'
  key: string // 当 kind=hash 为内容哈希；当 kind=name 为文件名
  files: string[]
}

// Tauri 事件：索引进度
export type IndexProgressPayload = {
  current?: number
  total?: number
  name?: string
  path?: string
  skipped?: boolean
}

// 自动扫描启动事件载荷
export type AutoScanStartPayload = {
  reason?: string
}

// 前端查询过滤与请求类型
export type SearchFilters = {
  ext?: string[]
  min_size?: number
  max_size?: number
}

export type SearchRequest = {
  query: string
  filters: SearchFilters | null
  indexDir: string
}

// 后端诊断报告返回结构
export type DiagnosticsReport = {
  index_dir: string
  index_open_ok: boolean
  index_doc_count?: number
  schema_fields?: string[]
  config_scan_roots_count: number
  config_auto_scan_enabled: boolean
  pipeline_started: boolean
  pipeline_completed: boolean
  pipeline_last_day?: string
  sys_cpu_avg?: number
  sys_total_mem_kib?: number
  sys_free_mem_kib?: number
  warnings: string[]
}