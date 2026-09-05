// UPGRADE_PLAN.md - Detailed map upgrade plan

## Current State
- Uses Leaflet.js for mapping
- Limited to: cartocdn.com/dark_all (dark tactical) and ArcGIS satellite tiles
- Basic zone overlays with intensity indicators
- Simple layer toggles (SEISMIC, THERMAL, STRUCTURAL, GAS)
- Manual zoom/pan controls
- Zone inspector panel

## Required Upgrades
1. Replace Leaflet with MapLibre GL JS for Google Maps-like experience
2. Add premium tile providers:
   - Base map: https://tile.openstreetmap.org/{z}/{x}/{y}.png (streets)
   - Terrain: https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}
   - Satellite: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
   - Hybrid: Satellite with roads and labels
3. Implement 6 view modes:
   - SATELLITE: Pure satellite imagery
   - TERRAIN: Shaded relief with terrain details
   - STREETS: Detailed road map with labels
   - HYBRID: Satellite + important roads and labels
   - INTELLIGENCE: Base map + disaster overlays
   - FULLSCREEN: Optimized for crisis operations (minimal UI)
4. Add professional controls:
   - Locate button (follow rover)
   - Fullscreen
   - Layer toggle (collapsible)
   - Zoom to fit bounds
   - View mode selector
   - Information cards on click
5. Implement disaster intelligence layers:
   - Fire zones (red/orange circles with warning symbols)
   - Flood zones (blue semi-transparent polygons)
   - Landslide zones (yellow/green patterns)
   - Structural collapse zones (gray/purple patterns)
   - Debris fields (dotted overlays)
   - Blocked roads (red dashed lines)
   - Hazard zones (various warning icons)
   - Survivor detections (human icons with confidence indicators)
   - Rover position (vehicle icon with heading)
   - Rescue routes (blue/green arrows and paths)
6. Add crisp vector markers:
   - Use SVG icons instead of PNG
   - Scale correctly at all zoom levels
   - Show severity and status
7. Implement smooth camera animations
8. Add sector grid overlay (subtle N-01, M-02, etc.)
9. Create tactical information cards
10. Maintain existing functionality:
    - Zone inspector with telemetry
    - Layer intensity meters
    - Live telemetry display
    - All existing features

## Files to Modify
1. frontend/src/components/DashboardSection.jsx - Complete rewrite with MapLibre
2. frontend/package.json - Add mapbox-gl dependency
3. frontend/src/styles/ - Add custom map styles
4. frontend/src/components/ - Create map-specific components

## Timeline
Phase 1: Replace Leaflet with MapLibre (1-2 days)
Phase 2: Add tile providers and view modes (1-2 days)
Phase 3: Implement disaster overlays (2-3 days)
Phase 4: Add controls and interactions (1-2 days)
Phase 5: Polish and testing (1-2 days)