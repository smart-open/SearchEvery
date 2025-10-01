import { useEffect, useRef, useState } from 'react'
import type { ThemeKey } from '../types'
import { themeOptions } from '../constants/themes'

type Props = {
  theme: ThemeKey
  onChange: (t: ThemeKey) => void
}

export default function ThemeDropdown({ theme, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="dropdown" ref={ref}>
      <button className={`theme-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <span className="theme-dot" /> 主题
      </button>
      {open && (
        <div className="dropdown-menu">
          {themeOptions.map(opt => (
            <div key={opt.key} className="dropdown-item" onClick={() => { onChange(opt.key); setOpen(false) }}>
              <span className="theme-dot" style={{ background: opt.color }} />
              <span>{opt.label}</span>
              {theme === opt.key && <span className="check">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}