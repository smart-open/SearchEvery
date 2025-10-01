// UI 展示相关常量（支持通过环境变量覆盖）
const envLen = Number((import.meta as any).env?.VITE_PATH_MAX_LEN ?? (globalThis as any).VITE_PATH_MAX_LEN)
export const PATH_MAX_LEN = Number.isFinite(envLen) && envLen > 10 ? envLen : 80