# Inzora Terra OS — Design System

Aligns with `BLUEPRINT.md` (v1.1). The shipped interface is a minimalist command center:
deep black background, near-white text, glass panels. Nothing decorative.

## Design Tokens

**Color Palette:**
- Background: `#09090b` with subtle noise texture
- Panel surface: `white/[0.02]` with border `white/[0.06]`
- Primary text: `#FAFAFA`
- Muted text: `white/40`–`white/60`
- Accent / active: `#3B82F6`
- Risk — Critical: `#EF4444`, Warning: `#F59E0B`, Low: `#22C55E`
- Knowledge accent: `#8B5CF6`

**Typography:**
- Headings: Inter, tight tracking, light weight
- Body: Inter, regular weight
- Data / telemetry: JetBrains Mono
- Labels: Inter, uppercase, wide tracking, small

**Spacing:** 4px grid; generous section whitespace, compact in-component spacing.

## Component Patterns

- **Panels:** rounded `rounded-2xl`, semi-transparent `bg-white/[0.02]`, subtle border `border-white/[0.06]`, `backdrop-blur-xl`
- **Cards:** no hard borders, depth via opacity layers
- **Buttons:** ghost style with hover fill
- **Status indicators:** colored dots with pulse animation
- **Motion:** Framer Motion — fade-in + lift for entrances, staggered reveals, confidence bars that fill
- **Scroll:** Lenis smooth scroll

## Current UI Structure (src/App.jsx)

Single-page scroll story: Nav → Hero (sensor badges) → Mission Dashboard (zone risk map + agent status) →
Agent Collaboration → Knowledge Retrieval (Prototype) → Mission Timeline → Assistive Bot.

Branding, icons: `lucide-react`. No custom icon set.
