/**
 * NeuralBackdrop - subtle animated background for high-level status surfaces.
 * Minimal Apple-design: solid background, no gradients, no cyan/amber accents,
 * pure minimal aesthetic matching the dashboard design language.
 */

import { useMemo, useState } from 'react'

export default function NeuralBackdrop({ className = '', dense = false }) {
  const [phase, setPhase] = useState(0)

  // Cycle phases for subtle animation
  useMemo(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 4)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className} bg-gray-950`} aria-hidden="true">
      {/* Subtle solid color overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(10,20,35,0.5)' }} />

      {/* Subtle dots pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(circle at 60% 40%, rgba(255,255,255,0.02) 0%, transparent 50%), radial-gradient(circle at 40% 60%, rgba(255,255,255,0.02) 0%, transparent 50%)',
        }}
      />

      {/* Subtle pulse indicator */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full opacity-30 animate-pulse-[rgba(99,179,252,0.2)]"
        style={{ animationDuration: '2s' }}
      />
    </div>
  )
}