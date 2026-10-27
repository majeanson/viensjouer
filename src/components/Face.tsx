// A child's initial on their colour. No photos in v1: other people's children.
export function Face({ name, colour }: { name: string; colour?: string }) {
  return (
    <span className="face" style={{ background: colour ?? 'var(--teal)' }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
