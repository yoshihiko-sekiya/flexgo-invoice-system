import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string

if (!mapboxToken) {
  console.warn('Mapbox token missing. Please set VITE_MAPBOX_TOKEN')
}

mapboxgl.accessToken = mapboxToken || 'demo-token'

export interface MapOptions {
  center?: [number, number]
  zoom?: number
  style?: string
}

export function initMap(container: HTMLElement, opts: MapOptions = {}): mapboxgl.Map {
  const map = new mapboxgl.Map({
    container,
    style: opts.style || 'mapbox://styles/mapbox/streets-v12',
    center: opts.center || [139.7671, 35.6816], // Tokyo
    zoom: opts.zoom || 13,
    attributionControl: false,
    logoPosition: 'bottom-right'
  })

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl(), 'top-right')

  return map
}

export { mapboxgl }
export default { initMap, mapboxgl }