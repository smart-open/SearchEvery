import React from 'react'

// 高亮文本中与查询词匹配的片段，支持多关键词（以空格分隔）匹配
export function highlight(text: string, q: string): JSX.Element {
  if (!q) return <span>{text}</span>

  // 1) 引号模式："..." 精确短语匹配（忽略大小写）
  const quoted = q.match(/^"([\s\S]*)"$/)
  if (quoted) {
    const phrase = quoted[1]
    if (!phrase) return <span>{text}</span>
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${esc})`, 'gi')
    const parts = text.split(re)
    return (
      <span>
        {parts.map((p, i) => (p.toLowerCase() === phrase.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
      </span>
    )
  }

  // 2) 正则模式：/pattern/flags（仅限安全 flags，如 i, m, s）
  const regexMatch = q.match(/^\/(.*)\/(.*)$/)
  if (regexMatch) {
    const pattern = regexMatch[1]
    const flagsRaw = regexMatch[2] || 'i'
    const safeFlags = flagsRaw.replace(/[^gimsuy]/g, '') || 'i'
    try {
      const re = new RegExp(`(${pattern})`, safeFlags)
      const parts = text.split(re)
      return (
        <span>
          {parts.map((p, i) => (re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
        </span>
      )
    } catch {
      // 正则构造失败则退回到默认多词匹配
    }
  }

  // 3) 默认：空格分词匹配（忽略大小写）
  const terms = q
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
  if (terms.length === 0) return <span>{text}</span>
  const escTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const union = escTerms.join('|')
  const re = new RegExp(`(${union})`, 'gi')
  const parts = text.split(re)
  return (
    <span>
      {parts.map((p, i) => (terms.some(t => p.toLowerCase() === t.toLowerCase()) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </span>
  )
}