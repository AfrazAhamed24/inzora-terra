/**
 * NeuralBackdrop - JARVIS-style neural network backdrop for cinematic surfaces.
 *
 * Pure SVG/CSS (no image assets): a deterministic neural mesh with travelling data
 * pulses, a perspective grid "floor" scrolling toward the viewer, drifting scanlines,
 * a radar sweep, and HUD corner brackets. The palette leans disaster-ops: deep
 * navy-black base with cyan signal lines and amber hazard accents.
 */

import { useMemo } from 'react'

// Deterministic PRNG so the mesh is identical across renders and page loads
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildNetwork(seed = 11, count = 30) {
  const rand = mulberry32(seed)
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand() * 100,
    y: rand() * 100,
    r: 1.2 + rand() * 2.6,
    core: rand() > 0.82,
  }))
  const links = []
  for (let i = 0; i < count; i += 1) {
    const neighbors = nodes
      .map((n, j) => ({ j, d: Math.hypot(nodes[i].x - n.x, nodes[i].y - n.y) }))
      .filter(({ j, d }) => j !== i && d < 30)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    for (const { j } of neighbors) {
      const dup = links.some((l) => (l.a === i && l.b === j) || (l.a === j && l.b === i))
      if (!dup) links.push({ a: i, b: j })
    }
  }
  // Long links become data-pulse carriers
  const pulses = links
    .map((l) => ({ ...l, d: Math.hypot(nodes[l.a].x - nodes[l.b].x, nodes[l.a].y - nodes[l.b].y) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 6)
  return { nodes, links, pulses }
}

const VW = 1000
const VH = 1000

export default function NeuralBackdrop({ className = '', dense = false }) {
  const { nodes, links, pulses } = useMemo(() => buildNetwork(dense ? 7 : 11, dense ? 42 : 30), [dense])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      {/* Deep ops base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 22%, rgba(10,32,54,0.85) 0%, rgba(6,10,18,0.95) 55%, #04050a 100%)',
        }}
      />

      {/* Neural mesh — slowly sinks downward ("drowning" momentum); oversized so
          the drift never exposes an edge. */}
      <div className="absolute -inset-[10%] nb-drift" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full opacity-70" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="nb-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.4" />
          </linearGradient>
          <radialGradient id="nb-glow">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>

        {links.map((l, i) => {
          const a = nodes[l.a]
          const b = nodes[l.b]
          return (
            <line
              key={`l${i}`}
              x1={a.x * VW / 100} y1={a.y * VH / 100}
              x2={b.x * VW / 100} y2={b.y * VH / 100}
              stroke="url(#nb-edge)"
              strokeWidth="0.6"
              className="nb-edge"
              style={{ animationDelay: `${(i % 8) * 0.55}s` }}
            />
          )
        })}

        {nodes.map((n) => (
          <g key={`n${n.id}`}>
            <circle cx={n.x * VW / 100} cy={n.y * VH / 100} r={n.r * 5.5} fill="url(#nb-glow)" opacity="0.35" className="nb-node" style={{ animationDelay: `${(n.id % 10) * 0.4}s` }} />
            <circle cx={n.x * VW / 100} cy={n.y * VH / 100} r={n.r} fill={n.core ? '#67e8f9' : '#38bdf8'} opacity={n.core ? 0.95 : 0.55} />
          </g>
        ))}

        {/* Travelling data pulses */}
        {pulses.map((p, i) => {
          const a = nodes[p.a]
          const b = nodes[p.b]
          return (
            <circle key={`p${i}`} r="2.2" fill="#a5f3fc" opacity="0.9">
              <animateMotion
                dur={`${4 + (i % 4)}s`}
                begin={`${i * 0.9}s`}
                repeatCount="indefinite"
                path={`M ${a.x * VW / 100} ${a.y * VH / 100} L ${b.x * VW / 100} ${b.y * VH / 100}`}
              />
            </circle>
          )
        })}
      </svg>
      </div>

      {/* Perspective grid floor */}
      <div
        className="absolute left-[-30%] right-[-30%] bottom-[-8%] h-[46%] nb-grid-floor"
        style={{
          transform: 'perspective(620px) rotateX(62deg)',
          transformOrigin: '50% 0%',
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.22) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent 85%)',
        }}
      />

      {/* Radar sweep */}
      <div
        className="absolute left-1/2 top-1/2 w-[130vmax] h-[130vmax] -translate-x-1/2 -translate-y-1/2 nb-radar"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(245,158,11,0.06) 0deg, rgba(245,158,11,0.02) 40deg, transparent 70deg)',
        }}
      />

      {/* Drifting scanlines */}
      <div
        className="absolute inset-0 nb-scanlines"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(148,197,255,0.05) 3px 4px)',
        }}
      />

      {/* Submerge pool — breathing darkness rising from below, the drowning pull */}
      <div
        className="absolute inset-x-0 bottom-0 h-[58%] nb-submerge"
        style={{
          background: 'linear-gradient(to top, rgba(2,4,10,0.92) 0%, rgba(2,4,10,0.5) 45%, transparent 100%)',
        }}
      />

      {/* HUD corner brackets */}
      <div className="absolute top-5 left-5 w-10 h-10 border-t border-l border-cyan-400/30" />
      <div className="absolute top-5 right-5 w-10 h-10 border-t border-r border-cyan-400/30" />
      <div className="absolute bottom-5 left-5 w-10 h-10 border-b border-l border-cyan-400/30" />
      <div className="absolute bottom-5 right-5 w-10 h-10 border-b border-r border-cyan-400/30" />

      {/* Hazard stripe accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] opacity-60"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0 14px, #09090b 14px 28px)',
        }}
      />
    </div>
  )
}
