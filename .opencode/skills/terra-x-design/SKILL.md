---
name: terra-x-design
description: Inzora Terra OS project design system and component patterns
---

# Inzora Terra OS Design Skill

## When to Use
- Building new UI components for the Inzora Terra OS command center
- Styling existing components
- Creating animations with Framer Motion
- Implementing responsive layouts

## Design Tokens
Reference `docs/DESIGN.md` and `BLUEPRINT.md` for:
- Color palette (dark `#09090b` theme, risk colors)
- Typography (Inter, JetBrains Mono)
- Spacing scale
- Border radius
- Glassmorphism patterns

## Component Patterns

### Zone Risk Panel
- Risk bar / dot (color-coded by risk level)
- Risk level label (CRITICAL/HIGH/MEDIUM/LOW)
- Hazard list with icons (lucide-react)
- Confidence indicator

### Agent Card
- Agent icon + name + status
- Confidence bar (fills on completion)
- Latency display (mono font)

### Knowledge Panel
- Document list with relevance score
- Source title + snippet
- Honest "Prototype" labeling (not RAG)

### Mission Timeline
- Chronological events: timestamp, agent, message
- Slide-in entrance animation
- Color-coded by agent

### Assistive Bot
- Slide-in from right
- Message bubbles with agent attribution

## Animation Specs
- Section entrance: fadeInUp (0.5s), stagger 0.1s
- Hover: scale(1.02) + subtle lift
- Confidence bar: width fill animation
- Scroll: Lenis smooth scroll

## Branding
Product name: **Inzora Terra OS** (UI may still read TERRA-X in the hero).
Use `lucide-react` icons — do not reintroduce a custom icon set.
