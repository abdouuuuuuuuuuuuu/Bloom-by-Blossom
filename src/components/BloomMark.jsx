export function BloomMark({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="translate(32 32)" fill="#462C7D">
        {[0, 72, 144, 216, 288].map((r, i) => (
          <ellipse key={r} rx="9" ry="18" cy="-12" transform={`rotate(${r})`} opacity={[0.95, 0.78, 0.6, 0.78, 0.95][i]} />
        ))}
        <circle r="6" fill="#E7A3B8" />
      </g>
    </svg>
  )
}
