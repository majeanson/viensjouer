import { useState } from 'react'

// A face: the person's photo when there is one, otherwise their initial on their colour. Optional like every
// photo — nothing breaks without it, and a picture that fails to load falls back to the initial.
export function Face({ name, colour, src, size = 'md' }: { name: string; colour?: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const [bad, setBad] = useState(false)
  return (
    <span className={`face face--${size}`} style={{ background: colour ?? 'var(--teal)' }} aria-hidden="true">
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} /> : name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
