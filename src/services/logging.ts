type AnyRecord = Record<string, any>

function nowIso() {
  try { return new Date().toISOString() } catch { return '' }
}

export function logInfo(message: string, context?: string, extra?: AnyRecord) {
  console.info('[INFO]', nowIso(), { context, message, ...extra })
}

export function logError(error: any, context?: string, extra?: AnyRecord) {
  const message = error?.message ?? error?.toString?.() ?? String(error)
  const stack = error?.stack
  console.error('[ERROR]', nowIso(), { context, message, stack, ...extra })
}