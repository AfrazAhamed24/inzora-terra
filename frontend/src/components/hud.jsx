/**
 * hud.jsx - Hologram HUD primitives.
 *
 * Angular cut-corner frames, radar dials, segmented meters and regulator buttons in
 * the style of sci-fi command interfaces. Pure CSS/SVG — no image assets. All of them
 * are presentational; they accept className so callers control sizing and placement.
 */

/**
 * Angular frame with cut corners and a cyan hologram border. Content sits inside the
 * clip, so keep a padding of at least ~20px on the corners.
 */
export function HudFrame({ children, className = '', tone = '#22d3ee', label, right }) {
  return (
    <div className={`hud-frame ${className}`}>
      <div className="hud-frame-border" style={{ boxShadow: `inset 0 0 0 1px ${tone}30` }} />
      <div
        className="hud-frame-glow"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${tone}0d 0%, transparent 70%)` }}
      />
      {(label || right) && (
        <div className="relative z-10 flex items-center justify-between gap-3 mb-3">
          <div className="hud-label" style={{ color: tone }}>
            {label}
          </div>
          {right && <div className="hud-label text-white/35">{right}</div>}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

/** Small uppercase HUD label with trailing rule. */
export function HudLabel({ children, tone = '#22d3ee', className = '' }) {
  return (
    <div className={`hud-label ${className}`} style={{ color: tone }}>
      {children}
    </div>
  )
}

/** Circular radar dial with rings, tick marks, crosshair and a rotating sweep. */
export function RadarDial({ size = 168, className = '', sweep = '#22d3ee' }) {
  const rings = [20, 36, 52, 68, 82]
  const ticks = Array.from({ length: 36 })
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ width: size, height: size }} aria-hidden="true">
      {/* outer ring */}
      <circle cx="50" cy="50" r="94" fill="none" stroke={`${sweep}18`} strokeWidth="0.6" />
      {/* concentric rings */}
      {rings.map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={`${sweep}22`} strokeWidth="0.45" />
      ))}
      {/* crosshair */}
      <line x1="6" y1="50" x2="94" y2="50" stroke={`${sweep}14`} strokeWidth="0.4" />
      <line x1="50" y1="6" x2="50" y2="94" stroke={`${sweep}14`} strokeWidth="0.4" />
      {/* tick marks */}
      {ticks.map((_, i) => {
        const a = (i * 10 * Math.PI) / 180
        const major = i % 9 === 0
        const r1 = major ? 86 : 88
        return (
          <line
            key={i}
            x1={50 + Math.cos(a) * r1}
            y1={50 + Math.sin(a) * r1}
            x2={50 + Math.cos(a) * 92}
            y2={50 + Math.sin(a) * 92}
            stroke={`${sweep}${major ? '66' : '2e'}`}
            strokeWidth={major ? 0.9 : 0.45}
          />
        )
      })}
      {/* rotating sweep wedge */}
      <g className="hud-sweep">
        <path d="M50 50 L50 6 A44 44 0 0 1 81.1 18.9 Z" fill={`${sweep}26`} />
        <path d="M50 50 L50 6 A44 44 0 0 1 81.1 18.9 Z" fill="none" stroke={`${sweep}88`} strokeWidth="0.8" />
      </g>
      {/* center */}
      <circle cx="50" cy="50" r="1.6" fill={sweep} />
      <circle cx="50" cy="50" r="3.4" fill="none" stroke={`${sweep}66`} strokeWidth="0.5" />
    </svg>
  )
}

/** Segmented hologram meter. value is 0..1. */
export function SegmentedBar({ value = 0, segments = 12, color = '#22d3ee', className = '' }) {
  const filled = Math.max(0, Math.min(segments, Math.round(value * segments)))
  return (
    <div className={`flex gap-[3px] ${className}`} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-2 flex-1"
          style={{
            background: i < filled ? color : 'rgba(255,255,255,0.07)',
            boxShadow: i < filled ? `0 0 6px ${color}55` : 'none',
          }}
        />
      ))}
    </div>
  )
}

/** Regulator-style angular button with cut corner. */
export function TechButton({ children, className = '', tone = '#22d3ee', ...rest }) {
  return (
    <button
      {...rest}
      className={`tech-btn text-[11px] font-display font-semibold tracking-[0.2em] uppercase ${className}`}
      style={{ '--tech-tone': tone }}
    >
      {children}
    </button>
  )
}

/** Scrolling data marquee (like the reference's π footer). Content is duplicated for a seamless loop. */
export function DataMarquee({ text, className = '' }) {
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`} aria-hidden="true">
      <div className="hud-marquee inline-block">
        {text} {text}
      </div>
    </div>
  )
}
