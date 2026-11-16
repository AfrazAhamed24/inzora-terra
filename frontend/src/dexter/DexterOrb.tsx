/**
 * D.E.X.T.E.R. — Central Intelligence Orb
 * Layered spherical energy structure: SVG orbital rings + CSS atmosphere.
 * Purely presentational — visual states are application-controlled
 * (standby | activating | online | processing | speaking | error).
 * No animation here implies agent execution; states are set by DexterExperience.
 */

import { useMemo, type CSSProperties } from 'react';

export type DexterOrbState =
  | 'standby'
  | 'activating'
  | 'online'
  | 'processing'
  | 'speaking'
  | 'error';

interface DexterOrbProps {
  state: DexterOrbState;
  /** Rendered diameter in px. */
  size?: number;
}

export function DexterOrb({ state, size = 240 }: DexterOrbProps) {
  const style = { '--orb-size': `${size}px` } as CSSProperties;

  /* Orbiting energy motes — three dots on the mid ring. */
  const motes = useMemo(
    () =>
      [0, 130, 250].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return { cx: 100 + 82 * Math.cos(rad), cy: 100 + 82 * Math.sin(rad) };
      }),
    []
  );

  return (
    <div className="dx-orb" data-state={state} style={style} aria-hidden="true">
      <div className="dx-orb-atmos" />
      {state === 'error' && <div className="dx-error-tint" />}

      <svg viewBox="0 0 200 200" focusable="false">
        <defs>
          <radialGradient id="dx-core-grad" cx="42%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#F4F1FA" stopOpacity="0.95" />
            <stop offset="28%" stopColor="#8957E5" stopOpacity="0.85" />
            <stop offset="62%" stopColor="#3978F6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#241536" stopOpacity="0.25" />
          </radialGradient>
          <linearGradient id="dx-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8957E5" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#3978F6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#8957E5" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="dx-glow-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8957E5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8957E5" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* soft halo */}
        <circle cx="100" cy="100" r="96" fill="url(#dx-glow-grad)" />

        {/* static outer reference circle */}
        <circle
          cx="100"
          cy="100"
          r="95"
          fill="none"
          stroke="rgba(169,157,189,0.14)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />

        {/* orbital ring 1 — tilted, forward spin */}
        <g className="dx-ring">
          <ellipse
            cx="100"
            cy="100"
            rx="86"
            ry="30"
            transform="rotate(16 100 100)"
            fill="none"
            stroke="url(#dx-ring-grad)"
            strokeWidth="1.4"
          />
        </g>

        {/* orbital ring 2 — counter spin */}
        <g className="dx-ring-r">
          <ellipse
            cx="100"
            cy="100"
            rx="76"
            ry="44"
            transform="rotate(-28 100 100)"
            fill="none"
            stroke="url(#dx-ring-grad)"
            strokeWidth="1"
            strokeDasharray="10 7"
          />
        </g>

        {/* orbital ring 3 — slow wide plane */}
        <g className="dx-ring-slow">
          <ellipse
            cx="100"
            cy="100"
            rx="92"
            ry="18"
            transform="rotate(56 100 100)"
            fill="none"
            stroke="url(#dx-ring-grad)"
            strokeWidth="0.9"
            opacity="0.7"
          />
        </g>

        {/* energy motes riding ring 1 */}
        <g className="dx-motes">
          {motes.map((m, i) => (
            <circle
              key={i}
              cx={m.cx}
              cy={m.cy}
              r="2.2"
              fill="#8957E5"
              opacity={i === 0 ? 0.9 : 0.55}
            />
          ))}
        </g>

        {/* internal energy arcs — rotating dash segments */}
        <g className="dx-core">
          <circle
            cx="100"
            cy="100"
            r="40"
            fill="none"
            stroke="url(#dx-ring-grad)"
            strokeWidth="2.4"
            strokeDasharray="46 90"
            strokeLinecap="round"
          />
        </g>
        <g className="dx-core-inner">
          <circle
            cx="100"
            cy="100"
            r="29"
            fill="none"
            stroke="url(#dx-ring-grad)"
            strokeWidth="1.6"
            strokeDasharray="20 42"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>

        {/* illuminated core */}
        <circle cx="100" cy="100" r="20" fill="url(#dx-core-grad)" />
        <circle cx="100" cy="100" r="9" fill="#F4F1FA" opacity="0.5" />
      </svg>

      {/* radial energy waves (activation / processing) */}
      <div className="dx-orb-waves">
        <span className="dx-orb-wave" />
        <span className="dx-orb-wave" />
        <span className="dx-orb-wave" />
      </div>

      {/* speaking waveform (driven in Phase 2; the state is wired now) */}
      <div className="dx-orb-waveform">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
