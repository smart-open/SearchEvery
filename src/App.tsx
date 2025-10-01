import { useEffect, useMemo, useRef, useState } from 'react'
// API 调用封装
import { readConfig, writeConfig, resetConfig, scanPaths, scanPathsProgress, buildInvertedIndex, buildInvertedIndexProgress, searchQuery, openLocation } from './services/api'
import { onIndexProgress, onIndexDone, onEvent } from './services/events'
import type { FileMeta, SearchResult, AppConfig, PageKey, ThemeKey } from './types'
import ThemeDropdown from './components/ThemeDropdown'
import AboutPage from './pages/AboutPage'
import { formatBytes, toBytesMb } from './utils/size'
import { formatTs, formatRelativeTs } from './utils/date'
import { isTauri } from './utils/env'
import { parseCSV } from './utils/string'
import { highlight } from './utils/highlight'
import { shortenPath } from './utils/path'
import useTauriEvents from './hooks/useTauriEvents'
import { PATH_MAX_LEN } from './constants/ui'
import useSearchHotkeys from './hooks/useSearchHotkeys'
import { logError } from './services/logging'
import useGlobalErrorLogging from './hooks/useGlobalErrorLogging'

export default function App() {
  const inTauri = useMemo(() => isTauri(), [])
  const [indexDir, setIndexDir] = useState('indexes/main')
  const [roots, setRoots] = useState('D:/')
  const [exclude, setExclude] = useState('\\Windows, \\Program Files, \\AppData')
  const [scanned, setScanned] = useState<FileMeta[]>([])
  const [scanCount, setScanCount] = useState(0)
  const [scanDir, setScanDir] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [enableContentParse, setEnableContentParse] = useState(false)
  const [page, setPage] = useState<PageKey>('search')
  const [theme, setTheme] = useState<ThemeKey>('eye')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [extFilter, setExtFilter] = useState('')
  const [minSize, setMinSize] = useState<string>('')
  const [maxSize, setMaxSize] = useState<string>('')
  const [sortBy, setSortBy] = useState<'score' | 'time' | 'size'>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [idxCurrent, setIdxCurrent] = useState(0)
  const [idxTotal, setIdxTotal] = useState(0)
  const [idxRunning, setIdxRunning] = useState(false)
  const [showRelativeTime, setShowRelativeTime] = useState(false)
  // 从配置应用路径显示最大长度（默认常量作为回退）
  const [pathMaxLen, setPathMaxLen] = useState<number>(PATH_MAX_LEN)
  // Tabs refs for focus and auto-scroll into view on change
  const viewTabsRef = useRef<HTMLDivElement | null>(null)
  const sortTabsRef = useRef<HTMLDivElement | null>(null)
  const tableBtnRef = useRef<HTMLButtonElement | null>(null)
  const cardBtnRef = useRef<HTMLButtonElement | null>(null)
  const sortScoreRef = useRef<HTMLButtonElement | null>(null)
  const sortTimeRef = useRef<HTMLButtonElement | null>(null)
  const sortSizeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const activeBtn = viewMode === 'table' ? tableBtnRef.current : cardBtnRef.current
    activeBtn?.focus({ preventScroll: true })
    const scrollContainer = viewTabsRef.current
    if (activeBtn && scrollContainer) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [viewMode])

  useEffect(() => {
    const activeBtn = sortBy === 'score' ? sortScoreRef.current : (sortBy === 'time' ? sortTimeRef.current : sortSizeRef.current)
    activeBtn?.focus({ preventScroll: true })
    const scrollContainer = sortTabsRef.current
    if (activeBtn && scrollContainer) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [sortBy])

  useEffect(() => {
    if (!inTauri) {
      setMsg('当前在浏览器预览模式。后端命令不可用，请使用 Tauri 开发模式进行端到端联调。')
    }
  }, [inTauri])

  // 全局错误日志捕获
  useGlobalErrorLogging()

  // 监听索引构建进度事件（统一通过 Hook 管理订阅与清理）
  useTauriEvents(inTauri, [
    () => onIndexProgress((payload) => {
      setIdxCurrent(payload?.current ?? 0)
      setIdxTotal(payload?.total ?? 0)
      setIdxRunning(true)
      setMsg(`索引中：${payload?.current ?? 0}/${payload?.total ?? 0} - ${payload?.name ?? ''}`)
    }),
    () => onIndexDone(() => {
      setIdxRunning(false)
      setMsg('索引构建完成')
    }),
  ], {
    onError: (e, idx) => {
      logError(e, 'tauri_event_subscribe', { index: idx })
    },
    retries: 3,
    backoffMs: 600,
  })

  useEffect(() => {
    if (!inTauri) return
    ;(async () => {
      try {
        const cfg = await readConfig()
        setIndexDir(cfg.index_dir || 'indexes/main')
        setRoots((cfg.scan_roots || []).join(', '))
        setExclude((cfg.exclude_patterns || []).join(', '))
        if (typeof cfg.path_max_len === 'number' && Number.isFinite(cfg.path_max_len)) {
          setPathMaxLen(cfg.path_max_len)
        }
        setMsg('已加载默认配置')
      } catch (e) {
        // 忽略读取失败，保留前端默认
      }
    })()
  }, [inTauri])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 全局快捷键抽离为 Hook
  useSearchHotkeys(setPage, searchInputRef)

  // 输入即搜（250ms 防抖）
  useEffect(() => {
    if (!inTauri || page !== 'search') return
    const handler = setTimeout(() => {
      if (query.trim()) doSearch()
    }, 250)
    return () => clearTimeout(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, extFilter, minSize, maxSize, page, inTauri])

  async function doScan() {
    if (!inTauri) return
    setBusy(true)
    setMsg('扫描中...')
    try {
      const opts = {
        roots: parseCSV(roots),
        exclude_patterns: parseCSV(exclude),
        max_file_size_mb: 500,
        follow_symlinks: false,
      }
      setScanCount(0)
      setScanDir('')
      const unlisten = await onEvent<{ current?: number; path?: string }>('scan_progress', (payload) => {
        if (payload?.current != null) setScanCount(payload.current)
        const p = payload?.path
        if (typeof p === 'string' && p.length > 0) {
          const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
          const dir = idx > 0 ? p.slice(0, idx) : p
          setScanDir(dir)
        }
      })
      const res = await scanPathsProgress(opts)
      unlisten()
      setScanned(res)
      setMsg(`扫描完成：${res.length} 个文件`)
    } catch (e: any) {
      logError(e, 'scan_paths')
      setMsg(e?.toString?.() ?? '扫描失败')
    } finally {
      setBusy(false)
    }
  }

  async function doIndex() {
    if (!inTauri) return
    setBusy(true)
    setMsg('索引构建中...')
    try {
      const opts = { indexDir, enable_content_parse: enableContentParse }
      await buildInvertedIndex(scanned, opts)
      setMsg('索引构建完成')
    } catch (e: any) {
      logError(e, 'build_inverted_index', { filesCount: scanned.length })
      setMsg(e?.toString?.() ?? '索引失败')
    } finally {
      setBusy(false)
    }
  }

  async function doIndexWithProgress() {
    if (!inTauri) return
    setBusy(true)
    setIdxCurrent(0)
    setIdxTotal(scanned.length)
    setIdxRunning(true)
    setMsg('索引构建中...')
    try {
      const opts = { indexDir, enable_content_parse: enableContentParse }
      await buildInvertedIndexProgress(scanned, opts)
    } catch (e: any) {
      logError(e, 'build_inverted_index_progress', { filesCount: scanned.length })
      setMsg(e?.toString?.() ?? '索引失败')
      setIdxRunning(false)
    } finally {
      setBusy(false)
    }
  }

  async function doSaveConfig() {
    if (!inTauri) return
    setBusy(true)
    setMsg('保存配置中...')
    try {
      const cfg: AppConfig = {
        search_mode: 'inverted',
        scan_roots: parseCSV(roots),
        exclude_patterns: parseCSV(exclude),
        index_dir: indexDir,
        path_max_len: pathMaxLen,
      }
      await writeConfig(cfg)
      setMsg('默认配置已保存')
    } catch (e: any) {
      logError(e, 'write_config')
      setMsg(e?.toString?.() ?? '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function doResetConfig() {
    if (!inTauri) return
    setBusy(true)
    setMsg('恢复默认配置中...')
    try {
      const cfg = await resetConfig()
      setIndexDir(cfg.index_dir || 'indexes/main')
      setRoots((cfg.scan_roots || []).join(', '))
      setExclude((cfg.exclude_patterns || []).join(', '))
      if (typeof cfg.path_max_len === 'number' && Number.isFinite(cfg.path_max_len)) {
        setPathMaxLen(cfg.path_max_len)
      }
      setMsg('已恢复默认配置')
    } catch (e: any) {
      logError(e, 'reset_config')
      setMsg(e?.toString?.() ?? '恢复默认失败')
    } finally {
      setBusy(false)
    }
  }

  async function doSearch() {
    if (!inTauri) return
    setBusy(true)
    setMsg('检索中...')
    try {
      const extArr = parseCSV(extFilter)
      const minVal = minSize.trim() ? Number(minSize) : undefined
      const maxVal = maxSize.trim() ? Number(maxSize) : undefined
      const minBytes = (minVal !== undefined && !Number.isNaN(minVal)) ? toBytesMb(minVal) : undefined
      const maxBytes = (maxVal !== undefined && !Number.isNaN(maxVal)) ? toBytesMb(maxVal) : undefined
      const filters = (extArr.length || minBytes !== undefined || maxBytes !== undefined) ? {
        ext: extArr.length ? extArr : undefined,
        min_size: minBytes,
        max_size: maxBytes,
      } : null
      const req = { query, filters, indexDir }
      const res = await searchQuery(req)
      setResults(res)
      setMsg(`返回 ${res.length} 条结果`)
      setPage('search')
      setSelected(res[0] ?? null)
    } catch (e: any) {
      logError(e, 'search_query', { query, extFilter, indexDir })
      setMsg(e?.toString?.() ?? '检索失败')
    } finally {
      setBusy(false)
    }
  }

  function clearQuery() {
    setQuery('')
    setResults([])
    setSelected(null)
    setMsg('查询已清空')
  }

  function resetFilters() {
    setExtFilter('')
    setMinSize('')
    setMaxSize('')
    setSortBy('score')
    setSortDir('desc')
    setViewMode('table')
    setMsg('筛选与视图已重置为默认')
  }

  const sortedResults = useMemo(() => {
    const arr = [...results]
    const factor = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (sortBy === 'score') return (a.score - b.score) * factor
      if (sortBy === 'time') return ((a.modified_ts ?? 0) - (b.modified_ts ?? 0)) * factor
      if (sortBy === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * factor
      return 0
    })
    return arr
  }, [results, sortBy, sortDir])

  function Header() {
    // 主题选择已封装至 ThemeDropdown 组件

    return (
      <header className="app-header">
        <div className="brand">
          <span className="logo">SE</span>
          <span className="title">SearchEvery</span>
        </div>
        <div className="searchbar">
          <input
            ref={searchInputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
            placeholder="请输入关键词（Ctrl/Cmd+K 聚焦）"
          />
          <button onClick={doSearch} disabled={busy || !inTauri}>搜索</button>
        </div>
        <div className="actions">
          <ThemeDropdown theme={theme} onChange={setTheme} />
        </div>
      </header>
    )
  }

  function Sidebar() {
    const items: { key: PageKey; label: string }[] = [
      { key: 'search', label: '全局搜索' },
      { key: 'index', label: '索引状态' },
      { key: 'dup', label: '重复文件' },
      { key: 'settings', label: '系统设置' },
  { key: 'about', label: '关于产品' },
    ]
    return (
      <aside className="app-sidebar">
        {items.map(it => (
          <button key={it.key} className={`nav-item ${page === it.key ? 'active' : ''}`} onClick={() => setPage(it.key)}>
            {it.label}
          </button>
        ))}
      </aside>
    )
  }

  function SearchPage() {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="filters row">
            <span className="muted">模式：倒排</span>
            <span className="divider" />
            <input className="chip-input" value={extFilter} onChange={e => setExtFilter(e.target.value)} placeholder="扩展名过滤，如：pdf, docx" />
            <input className="chip-input" value={minSize} onChange={e => setMinSize(e.target.value)} placeholder="最小大小（MB）" />
            <input className="chip-input" value={maxSize} onChange={e => setMaxSize(e.target.value)} placeholder="最大大小（MB）" />
            <button className="ghost btn-tablike btn-fixed btn-outline-primary" onClick={doSearch} disabled={busy || !inTauri}>
              <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              查询
            </button>
            <span className="divider" />
            <button className="ghost btn-tablike btn-fixed btn-outline-primary" onClick={resetFilters} aria-label="重置">
              <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-9.51L1 10" />
                </svg>
              </span>
              重置
            </button>
          </div>
          <div className="row">
            <div className="status">{msg}</div>
            <div className="view-toggle">
              <div className="tabs" role="tablist" aria-label="视图切换" ref={viewTabsRef} onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setViewMode(viewMode === 'table' ? 'card' : 'table');
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  setViewMode('table');
                } else if (e.key === 'End') {
                  e.preventDefault();
                  setViewMode('card');
                }
              }}>
                <button ref={tableBtnRef} className={`ghost ${viewMode === 'table' ? 'active' : ''}`} role="tab" aria-selected={viewMode === 'table'} tabIndex={viewMode === 'table' ? 0 : -1} onClick={() => setViewMode('table')}>
                  <span className="tab-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="8" height="8" rx="1" />
                      <rect x="13" y="3" width="8" height="8" rx="1" />
                      <rect x="3" y="13" width="8" height="8" rx="1" />
                      <rect x="13" y="13" width="8" height="8" rx="1" />
                    </svg>
                  </span>
                  表格
                </button>
                <button ref={cardBtnRef} className={`ghost ${viewMode === 'card' ? 'active' : ''}`} role="tab" aria-selected={viewMode === 'card'} tabIndex={viewMode === 'card' ? 0 : -1} onClick={() => setViewMode('card')}>
                  <span className="tab-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <line x1="6" y1="9" x2="14" y2="9" />
                      <line x1="6" y1="13" x2="18" y2="13" />
                    </svg>
                  </span>
                  卡片
                </button>
              </div>
              <select className="tabs-select" value={viewMode} onChange={e => setViewMode(e.target.value as any)}>
                <option value="table">表格</option>
                <option value="card">卡片</option>
              </select>
              <span className="divider" />
              <span className="muted">排序：</span>
              <div className="tabs tabs-sort" role="tablist" aria-label="排序切换" ref={sortTabsRef}>
                <button ref={sortScoreRef} className={`ghost ${sortBy === 'score' ? 'active' : ''}`} role="tab" aria-selected={sortBy === 'score'} tabIndex={sortBy === 'score' ? 0 : -1} onClick={() => setSortBy('score')}>综合</button>
                <button ref={sortTimeRef} className={`ghost ${sortBy === 'time' ? 'active' : ''}`} role="tab" aria-selected={sortBy === 'time'} tabIndex={sortBy === 'time' ? 0 : -1} onClick={() => setSortBy('time')}>时间</button>
                <button ref={sortSizeRef} className={`ghost ${sortBy === 'size' ? 'active' : ''}`} role="tab" aria-selected={sortBy === 'size'} tabIndex={sortBy === 'size' ? 0 : -1} onClick={() => setSortBy('size')}>大小</button>
              </div>
              <select className="tabs-select tabs-select-sort" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="score">综合</option>
                <option value="time">时间</option>
                <option value="size">大小</option>
              </select>
              <button className="ghost" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '升序' : '降序'}</button>
              <span className="divider" />
              <button className="ghost" onClick={() => setShowRelativeTime(v => !v)}>时间显示：{showRelativeTime ? '相对' : '绝对'}</button>
            </div>
          </div>
        </div>
        <div className="panel-body split">
          <div className="primary">
            {viewMode === 'table' ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>路径</th>
                    <th>类型</th>
                    <th style={{ width: 120 }}>分数</th>
          <th style={{ width: 120 }}>大小</th>
                    <th style={{ width: 160 }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r, i) => (
                    <tr key={i} className={selected?.path === r.path ? 'selected' : ''} onClick={() => setSelected(r)}>
                      <td className="name">
                        <div>{highlight(r.name, query)}</div>
                        {r.summary && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{highlight(r.summary, query)}</div>}
                      </td>
                      <td className="path" title={r.path}>{shortenPath(r.path, pathMaxLen)}</td>
                      <td>{r.ext}</td>
                      <td>{r.score.toFixed(4)}</td>
                <td>{r.size != null ? formatBytes(r.size) : '-'}</td>
                <td>{showRelativeTime ? formatRelativeTs(r.modified_ts) : formatTs(r.modified_ts)}</td>
                    </tr>
                  ))}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">暂无结果，试试输入关键词并点击搜索</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="cards">
                {sortedResults.map((r, i) => (
                  <div key={i} className={`card ${selected?.path === r.path ? 'selected' : ''}`} onClick={() => setSelected(r)}>
                    <div className="card-title">{highlight(r.name, query)}<span className="badge">{r.ext}</span></div>
          {r.summary && <div className="card-path">{highlight(r.summary, query)}</div>}
          <div className="card-path" title={r.path}>{shortenPath(r.path, pathMaxLen)}</div>
              <div className="card-score">分数 {r.score.toFixed(4)} · 大小 {r.size != null ? formatBytes(r.size) : '-'} · 时间 {showRelativeTime ? formatRelativeTs(r.modified_ts) : formatTs(r.modified_ts)}</div>
                  </div>
                ))}
                {results.length === 0 && <div className="empty">暂无结果，试试输入关键词并点击搜索</div>}
              </div>
            )}
          </div>
          <aside className="detail">
            {selected ? (
              <div className="detail-box">
                <div className="detail-title">{selected.name}</div>
                <div className="detail-meta">
                  <div>类型：{selected.ext}</div>
          <div className="muted" title={selected.path}>路径：{shortenPath(selected.path, pathMaxLen)}</div>
                  <div className="muted">分数：{selected.score.toFixed(4)}</div>
              <div className="muted">大小：{selected?.size != null ? formatBytes(selected.size) : '-'}</div>
              <div className="muted">时间：{showRelativeTime ? formatRelativeTs(selected?.modified_ts) : formatTs(selected?.modified_ts)}</div>
                </div>
                <div className="detail-actions">
                  <button className="ghost" onClick={() => { if (inTauri && selected) openLocation(selected.path) }}>打开位置</button>
                  <button className="ghost" onClick={() => { if (selected) { navigator.clipboard?.writeText?.(selected.path).then(() => setMsg('已复制路径')).catch(() => setMsg('复制失败')) } }}>复制路径</button>
                  <button className="ghost">收藏</button>
                </div>
                <div className="preview muted">{selected.summary ? highlight(selected.summary, query) : '预览占位（文本片段/缩略图）'}</div>
              </div>
            ) : (
              <div className="empty">请选择左侧结果查看详情</div>
            )}
          </aside>
        </div>
      </div>
    )
  }

  function IndexPage() {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="status">{msg}</div>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <label>
              目录根（逗号分隔）
              <input value={roots} onChange={e => setRoots(e.target.value)} placeholder="如：D:/, E:/work" />
            </label>
            <label>
              排除模式
              <input value={exclude} onChange={e => setExclude(e.target.value)} placeholder="如：\\Windows, \\Program Files" />
            </label>
            <label>
              索引目录
              <input value={indexDir} onChange={e => setIndexDir(e.target.value)} placeholder="indexes/main" />
            </label>
          </div>
          <div className="row">
            <button onClick={doScan} disabled={busy || !inTauri}>开始扫描</button>
            <button onClick={doIndexWithProgress} disabled={busy || !inTauri}>构建索引</button>
            <label className="checkbox">
              <input type="checkbox" checked={enableContentParse} onChange={e => setEnableContentParse(e.target.checked)} />
              启用内容解析（仅文本类）
            </label>
            <button className="ghost" onClick={doSaveConfig} disabled={busy || !inTauri}>保存为默认配置</button>
            <button className="ghost" onClick={doResetConfig} disabled={busy || !inTauri}>恢复默认配置</button>
          </div>
          {idxTotal > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="status">索引进度：{idxCurrent}/{idxTotal}</div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 999 }}>
                <div style={{ width: `${Math.min(100, Math.round(idxCurrent / Math.max(1, idxTotal) * 100))}%`, height: 8, background: 'var(--primary)', borderRadius: 999 }} />
              </div>
              <div className="row" style={{ marginTop: 20 }}>
                <button className="ghost" disabled>暂停（预留）</button>
                <button className="ghost" disabled>继续（预留）</button>
                <button className="ghost" disabled={!idxRunning}>取消（预留）</button>
              </div>
            </div>
          )}
          <div className="muted" style={{ marginTop: 8 }}>
            已扫描文件：{busy ? scanCount : scanned.length}
            {busy && scanDir ? ` · 正在扫描：${shortenPath(scanDir, pathMaxLen)}` : ''}
          </div>
        </div>
      </div>
    )
  }

  function DupPage() {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="status">重复文件（占位功能）</div>
        </div>
        <div className="panel-body">
          <div className="empty">尚未实现重复检测，后续将按组展示重复项并支持清理策略</div>
        </div>
      </div>
    )
  }

  function SettingsPage() {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="status">设置：主题与语言</div>
        </div>
        <div className="panel-body">
          <div className="row">
            <label>
              主题色调
              <select style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)' }} value={theme}
                onChange={e => setTheme(e.target.value as any)}>
                <option value="light">明亮色</option>
                <option value="dark">暗黑色</option>
                <option value="eye">护眼色</option>
                <option value="tech">科技色</option>
                <option value="sky">天蓝色</option>
                <option value="purple">暗紫色</option>
                <option value="gray">暗灰色</option>
              </select>
            </label>
            <label>
              语言
              <select style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)' }} value={lang}
                onChange={e => setLang(e.target.value as any)}>
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              路径显示最大长度（20–200）
              <div className="row" style={{ gap: 8 }}>
                <input type="range" min={20} max={200} step={5} value={pathMaxLen} onChange={e => setPathMaxLen(Number(e.target.value))} />
                <input type="number" min={20} max={200} step={5} value={pathMaxLen} onChange={e => setPathMaxLen(Number(e.target.value))} style={{ width: 80, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)' }} />
                <button className="ghost" onClick={doSaveConfig} disabled={busy || !inTauri}>保存为默认配置</button>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>预览：{shortenPath('D:/very/long/example/path/with/many/subfolders/file.txt', pathMaxLen)}</div>
            </label>
          </div>
        </div>
      </div>
    )
  }

  // 关于页已模块化至 src/pages/AboutPage.tsx

  function renderContent() {
    switch (page) {
      case 'search': return <SearchPage />
      case 'index': return <IndexPage />
      case 'dup': return <DupPage />
      case 'settings': return <SettingsPage />
      case 'about': return <AboutPage />
    }
  }

  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}