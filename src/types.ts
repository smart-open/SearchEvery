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
}

export type PageKey = 'search' | 'index' | 'dup' | 'settings' | 'about'

export type ThemeKey = 'light' | 'dark' | 'eye' | 'tech' | 'sky' | 'purple' | 'gray'

// Tauri 事件：索引进度
export type IndexProgressPayload = {
  current?: number
  total?: number
  name?: string
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