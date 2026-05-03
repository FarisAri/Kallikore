'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Article } from '@/lib/articles'

type Stage = 1 | 2 | 3

interface GlobeProps {
  stage: Stage
  articles: Article[]
  selectedArticle: Article | null
  onArticleClick: (article: Article) => void
}

export default function Globe({ stage, articles, selectedArticle, onArticleClick }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)      // style + markers ready
  const [tilesLoaded, setTilesLoaded] = useState(false) // first full render done

  const spinningRef = useRef(true)
  const orbitingCityRef = useRef(false)
  const currentRotationRef = useRef(0)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const animFrameRef = useRef<number>(0)
  const onArticleClickRef = useRef(onArticleClick)

  useEffect(() => {
    onArticleClickRef.current = onArticleClick
  })

  // Initialize map once on mount
  useEffect(() => {
    if (!containerRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new maplibregl.Map({
      container: containerRef.current,
      interactive: false,
      maxTileCacheSize: 5000,
      // Extra cache options not in TS types but valid at runtime
      ...({ maxTileCacheZoomLevels: 15, prefetchZoomDelta: 2 } as object),
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        projection: { type: 'globe' },
        sources: {
          satellite: {
            type: 'raster' as const,
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background' as const,
            paint: { 'background-color': 'rgba(0, 0, 0, 0)' },
          },
          {
            id: 'satellite-layer',
            type: 'raster' as const,
            source: 'satellite',
            paint: { 'raster-opacity': 1 as 1 },
          },
        ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      center: [0, 20],
      zoom: 2.8,
      minZoom: 0.5,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      touchZoomRotate: false,
      renderWorldCopies: false,
    })

    mapRef.current = map
    currentRotationRef.current = map.getCenter().lng

    map.on('style.load', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setProjection({ type: 'globe' } as any)
    })

    const spinGlobe = () => {
      const m = mapRef.current
      if (!m) return

      if (spinningRef.current) {
        currentRotationRef.current += 0.05
        if (currentRotationRef.current > 180) currentRotationRef.current -= 360
        m.jumpTo({ center: [currentRotationRef.current, m.getCenter().lat], zoom: m.getZoom() })
      } else if (orbitingCityRef.current) {
        m.jumpTo({ bearing: m.getBearing() + 0.05, zoom: m.getZoom() })
      }
      animFrameRef.current = requestAnimationFrame(spinGlobe)
    }

    // 'load' fires when style is parsed — start spinning and allow markers
    map.once('load', () => {
      setMapReady(true)
      spinGlobe()
    })

    // 'idle' fires after the first complete tile render — fade out the loading overlay
    map.once('idle', () => setTilesLoaded(true))

    // Fallback: hide overlay after 8 s even on slow connections
    const fallbackTimer = setTimeout(() => setTilesLoaded(true), 8000)

    return () => {
      clearTimeout(fallbackTimer)
      cancelAnimationFrame(animFrameRef.current)
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Respond to stage changes — padding is baked into flyTo so there's one animation
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (stage === 1) {
      map.flyTo({ center: [map.getCenter().lng, 20], zoom: 2.8, pitch: 0, bearing: 0, speed: 1.2, essential: true, padding: { right: 0 } })
      spinningRef.current = true
      orbitingCityRef.current = false
    } else if (stage === 2) {
      map.flyTo({ center: [map.getCenter().lng, 20], zoom: 2.8, pitch: 0, bearing: 0, speed: 1.2, essential: true, padding: { right: 450 } })
      spinningRef.current = true
      orbitingCityRef.current = false
    }
    // stage 3 transitions driven by selectedArticle effect
  }, [stage])

  // Fly to selected article and start orbiting
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedArticle) return

    spinningRef.current = false
    orbitingCityRef.current = false

    const tooltips = document.querySelectorAll<HTMLElement>('.ray-tooltip')
    tooltips.forEach(t => { t.style.opacity = '0' })

    const timer = setTimeout(() => {
      map.flyTo({
        center: selectedArticle.lngLat,
        zoom: 15,
        speed: 0.7,
        curve: 1.0,   // was 1.5 — lower curve = less dramatic zoom-out arc
        pitch: 50,    // was 60 — slightly less steep so city feels closer
        bearing: 0,
        essential: true,
        padding: { right: 450 },
      })
    }, 150)

    map.once('moveend', () => {
      orbitingCityRef.current = true
      tooltips.forEach(t => { t.style.opacity = '' })
    })

    return () => clearTimeout(timer)
  }, [selectedArticle])

  // Add / refresh map markers when articles are set (after map is ready)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    articles.forEach(article => {
      const el = document.createElement('div')
      el.className = 'ray-marker'

      const tooltip = document.createElement('div')
      tooltip.className = 'ray-tooltip'
      tooltip.innerHTML = `
        <img src="${article.imageUrl}" class="tooltip-img" alt="">
        <div class="tooltip-content">
          <div class="tooltip-meta">${article.location}</div>
          <h4>${article.title}</h4>
          <p>${article.summary.replace('AI Summary: ', '')}</p>
        </div>
      `
      el.appendChild(tooltip)

      el.addEventListener('click', e => {
        e.stopPropagation()
        onArticleClickRef.current(article)
      })

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(article.lngLat)
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [articles, mapReady])

  return (
    <>
      <div ref={containerRef} id="map" />
      <div id="globe-loader" className={tilesLoaded ? 'loaded' : ''}>
        <div id="globe-loader-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4facfe" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span>Loading globe&hellip;</span>
        </div>
      </div>
    </>
  )
}
