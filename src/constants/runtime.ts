// 集中化服务层的默认运行时配置（支持通过环境变量覆盖）
const envTimeout = Number((import.meta as any).env?.VITE_INVOKE_TIMEOUT_MS ?? (globalThis as any).VITE_INVOKE_TIMEOUT_MS)
const envRetries = Number((import.meta as any).env?.VITE_INVOKE_RETRIES ?? (globalThis as any).VITE_INVOKE_RETRIES)
export const INVOKE_DEFAULTS = {
  timeoutMs: Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 60000,
  retries: Number.isFinite(envRetries) && envRetries >= 0 ? envRetries : 0,
}

export const INVOKE_TIMEOUTS = {
  readConfig: 30000,
  writeConfig: 30000,
  scanPaths: 120000,
  buildIndex: 300000,
  searchQuery: 60000,
  openLocation: 30000,
  // 新增：合并管道启动与手动自动扫描触发的超时
  pipelineStart: 600000, // 10 分钟，管道可能较长
  startAutoScanNow: 60000,
  // 诊断报告
  diagnosticsReport: 45000,
}