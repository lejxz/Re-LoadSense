/**
 * 5 free map tile themes for the theme switcher.
 * See concept/05-tech-stack.md §6.
 */

export interface MapTheme {
  id: string
  name: string
  url: string
  attribution: string
  maxZoom: number
  isDark?: boolean
  preview?: string
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'carto-light',
    name: 'Clean Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
  },
  {
    id: 'carto-dark',
    name: 'Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
    isDark: true,
  },
  {
    id: 'osm-standard',
    name: 'OSM Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  {
    id: 'cyclosm',
    name: 'Cycle Map',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; CyclOSM &copy; OpenStreetMap contributors',
    maxZoom: 20,
  },
  {
    id: 'esri-satellite',
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
  },
]

export function getThemeById(id: string): MapTheme {
  return MAP_THEMES.find((t) => t.id === id) ?? MAP_THEMES[0]!
}
