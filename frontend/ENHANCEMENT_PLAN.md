// The current implementation uses Leaflet with basic tile layers (dark tactical and ArcGIS satellite).
// Leaflet provides basic map functionality but doesn't offer the high-quality, interactive, Google Maps-style
// experience required for a professional geospatial intelligence system.

// Based on the requirements, I need to:
// 1. Replace Leaflet with a more advanced map library
// 2. Add high-quality tile providers for satellite, terrain, streets, and hybrid views
// 3. Implement proper view modes with layer controls
// 4. Add disaster intelligence overlays on top of crisp geographic imagery
// 5. Support deep zoom levels and smooth camera transitions
// 6. Make the map feel like Google Maps/Google Earth

// The best choice would be MapLibre GL JS, which provides:
// - Vector and raster tiles
// - High-quality rendering
// - Smooth zoom and pan
// - Custom style support
// - Good performance for live data overlays
// - Industry-standard geospatial capabilities

// However, for simplicity and to maintain compatibility with existing code,
// I'll enhance the current Leaflet implementation with better tile sources
// and add comprehensive view modes and overlays.

// But actually, looking more carefully at the requirements, I should use
// a much better map solution. MapLibre GL JS would be the best choice for
// this professional geospatial application.

// However, I also need to consider that the user wants:
// - Google Maps-like experience
// - High-quality satellite imagery
// - Smooth 3D/pitch capability
// - Layer controls
// - Multiple view modes

// MapLibre with a premium tile provider would be ideal. But I'm also considering
// that we might want to use the Google Maps API directly for the best Google Maps-like experience.

// Actually, let me check what the requirements emphasize:
// 1. "Google Maps / Google Earth-style terrain or satellite experience"
// 2. "Clear geographic imagery"
// 3. "Realistic terrain"
// 4. "High-resolution map rendering"
// 5. "Deep zoom"
// 6. "Smooth pan/zoom"
// 7. "Crisp roads and geographic labels"
// 8. "Real satellite/aerial imagery where available"
// 9. "Hybrid Satellite imagery + important roads and labels"

// The current implementation only has:
// - Dark tactical basemap (cartocdn.com)
// - Satellite basemap (ArcGIS World Imagery)

// These are functional but not at the quality level requested.

// I should enhance the current solution first to see if it meets requirements.
// If not, then replace with MapLibre GL JS.

// Let me first identify what needs to be changed:

// 1. IMPROVE EXISTING TILES:
//    - Current dark tactical: cartocdn.com/dark_all (decent but not Google Maps quality)
//    - Current satellite: ArcGIS World Imagery (good but limited controls)

// 2. ADD PREMIUM TILE PROVIDERS:
//    - Google's base map tiles for streets
//    - Better terrain/shaded relief tiles
//    - Terrain with labels
//    - Imagery with labels (Google Earth-style)

// 3. IMPLEMENT VIEW MODES:
//    - Satellite
//    - Terrain
//    - Streets (with OpenStreetMap or Google)
//    - Hybrid (Satellite + roads)

// 4. ADD DISASTER OVERLAYS:
//    - Fire zones
//    - Flood zones
//    - Landslide zones
//    - Structural collapse zones
//    - Debris fields
//    - Blocked roads
//    - Survivor detections
//    - Rover position
//    - Rescue routes

// 5. ADD CONTROLS:
//    - Layer control
//    - Locate button
//    - Fullscreen
//    - Zoom controls
//    - Map type selector

// 6. IMPROVE MARKERS:
//    - Use crisp SVG icons
//    - Vector-based for smooth zooming
//    - Custom styling

// Let me start by enhancing the current Leaflet implementation.

// I'll use MapLibre GL JS to provide a much better experience. This will:
// - Use vector tiles for crisp rendering at all zoom levels
// - Support custom styles for disaster overlays
// - Provide smooth interactions and animations
// - Allow complex layering and filtering
// - Support 3D buildings and terrain

// The plan:
// 1. Install MapLibre GL JS
// 2. Replace Leaflet with MapLibre
// 3. Set up high-quality tile sources (Mapbox/Ordnance Survey for UK)
// 4. Implement view modes and layer controls
// 5. Add disaster intelligence overlays with custom vector styles
// 6. Add interactive markers and info cards
// 7. Add camera controls and view tools
// 8. Ensure performance and smooth animations

// Let me start by checking if we have the right dependencies already.