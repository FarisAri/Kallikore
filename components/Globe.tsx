'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Article } from '@/lib/articles'

type Stage = 1 | 2 | 3

interface GlobeProps {
  stage: Stage
  articles: Article[]
  selectedArticle: Article | null
  /** When false, map uses no right inset so the globe stays centered (panel slid away). */
  rightPanelPinned: boolean
  onArticleClick: (article: Article) => void
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Google-style map pin (screen-vertical via Marker viewport alignment), theme blues. */
function articlePinSvg(article: Article): string {
  const gid = `pin-${String(article.id).replace(/\W/g, '_') || 'm'}`
  return `<svg class="map-pin-svg" width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7dd3fc"/>
        <stop offset="40%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <filter id="${gid}-sh" x="-35%" y="-35%" width="170%" height="170%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#0ea5e9" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path filter="url(#${gid}-sh)" fill="url(#${gid}-g)" d="M20 2C11.6 2 5 8.7 5 17.2c0 9.8 15 30.3 15 30.3s15-20.5 15-30.3C35 8.7 28.4 2 20 2z"/>
    <circle cx="20" cy="17.5" r="5.5" fill="#0f172a"/>
    <circle cx="20" cy="16.3" r="2" fill="#475569" opacity="0.5"/>
  </svg>`
}

export default function Globe({
  stage,
  articles,
  selectedArticle,
  rightPanelPinned,
  onArticleClick,
}: GlobeProps) {
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
  const moveEndCleanupRef = useRef<(() => void) | null>(null)
  const stageRef = useRef(stage)
  const selectedArticleRef = useRef<Article | null>(selectedArticle)
  const rightPanelPinnedRef = useRef(rightPanelPinned)
  /** Longitude of last opened article — used when flying back to the list (selectedArticle is already null). */
  const lastArticleLngRef = useRef<number | null>(null)
  const prevStageForPaddingRef = useRef<Stage>(stage)

  // Keep refs aligned for spinGlobe (rAF) — effects run too late, so orbit could continue one frame with stale stage.
  stageRef.current = stage
  selectedArticleRef.current = selectedArticle
  rightPanelPinnedRef.current = rightPanelPinned

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

      if (orbitingCityRef.current && stageRef.current !== 3) {
        orbitingCityRef.current = false
      }

      if (spinningRef.current) {
        currentRotationRef.current += 0.05
        if (currentRotationRef.current > 180) currentRotationRef.current -= 360
        const inset =
          (stageRef.current === 2 || stageRef.current === 3) &&
          rightPanelPinnedRef.current
            ? 450
            : 0
        m.jumpTo({
          center: [currentRotationRef.current, 20],
          zoom: 2.8,
          pitch: 0,
          bearing: 0,
          padding: { right: inset },
        })
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
      moveEndCleanupRef.current?.()
      moveEndCleanupRef.current = null
      cancelAnimationFrame(animFrameRef.current)
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  // When the right panel pins/unpins, adjust viewport padding (e.g. orbit mode doesn't run spinGlobe).
  // Skip when only switching list ↔ article (stage 2↔3): same inset, but a competing easeTo can cancel the stage flyTo zoom-out.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const prev = prevStageForPaddingRef.current
    prevStageForPaddingRef.current = stage

    const inset = rightPanelPinned && (stage === 2 || stage === 3) ? 450 : 0
    const listArticleOnly =
      (prev === 2 || prev === 3) && (stage === 2 || stage === 3) && prev !== stage
    if (listArticleOnly) return

    map.easeTo({ padding: { right: inset }, duration: 280, essential: true })
  }, [rightPanelPinned, stage, mapReady])

  // Globe camera for stages 1–2 (layout so spinGlobe sees updated stageRef before the next paint/rAF).
  // Stage 2 list view requires selectedArticle == null so we don’t fight the article zoom-in effect.
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return

    moveEndCleanupRef.current?.()
    moveEndCleanupRef.current = null

    const rightInset =
      rightPanelPinned && (stage === 2 || stage === 3) ? 450 : 0

    if (stage === 1) {
      orbitingCityRef.current = false
      spinningRef.current = false
      map.stop()
      currentRotationRef.current = map.getCenter().lng
      map.flyTo({ center: [currentRotationRef.current, 20], zoom: 2.8, pitch: 0, bearing: 0, speed: 1.2, essential: true, padding: { right: 0 } })
      const onMoveEnd = () => {
        currentRotationRef.current = map.getCenter().lng
        spinningRef.current = true
      }
      map.once('moveend', onMoveEnd)
      moveEndCleanupRef.current = () => map.off('moveend', onMoveEnd)
    } else if (stage === 2 && selectedArticle == null) {
      orbitingCityRef.current = false
      spinningRef.current = false
      map.stop()
      const lng =
        lastArticleLngRef.current ??
        currentRotationRef.current ??
        map.getCenter().lng
      currentRotationRef.current = lng
      map.flyTo({
        center: [lng, 20],
        zoom: 2.8,
        pitch: 0,
        bearing: 0,
        speed: 1.2,
        essential: true,
        padding: { right: rightInset },
      })
      const onMoveEnd = () => {
        currentRotationRef.current = map.getCenter().lng
        spinningRef.current = true
      }
      map.once('moveend', onMoveEnd)
      moveEndCleanupRef.current = () => map.off('moveend', onMoveEnd)
    }
    // stage 3 + stage 2 with a selected article: article effect owns fly-in
    // mapReady: map is created in useEffect, so first layout pass often has no map yet.
  }, [stage, selectedArticle, rightPanelPinned, mapReady])

  // Fly to selected article and start orbiting
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedArticle) return

    lastArticleLngRef.current = selectedArticle.lngLat[0]

    moveEndCleanupRef.current?.()
    moveEndCleanupRef.current = null
    spinningRef.current = false
    orbitingCityRef.current = false
    map.stop()

    const tooltips = document.querySelectorAll<HTMLElement>('.map-pin-tooltip')
    tooltips.forEach(t => { t.style.opacity = '0' })

    const inset = rightPanelPinned ? 450 : 0
    const timer = setTimeout(() => {
      map.flyTo({
        center: selectedArticle.lngLat,
        zoom: 15,
        speed: 0.7,
        curve: 1.0,   // was 1.5 — lower curve = less dramatic zoom-out arc
        pitch: 50,    // was 60 — slightly less steep so city feels closer
        bearing: 0,
        essential: true,
        padding: { right: inset },
      })
    }, 150)

    const onMoveEnd = () => {
      orbitingCityRef.current = true
      tooltips.forEach(t => { t.style.opacity = '' })
      moveEndCleanupRef.current = null
    }

    map.once('moveend', onMoveEnd)
    moveEndCleanupRef.current = () => map.off('moveend', onMoveEnd)

    return () => {
      clearTimeout(timer)
      map.off('moveend', onMoveEnd)
      orbitingCityRef.current = false
      // Do not clear moveEndCleanupRef here — the stage layout effect may have replaced it with its own disposer.
    }
  }, [selectedArticle, rightPanelPinned])

  // Add / refresh map markers when articles are set (after map is ready)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    articles.forEach(article => {
      const root = document.createElement('div')
      root.className = 'map-pin-marker'

      const hit = document.createElement('button')
      hit.type = 'button'
      hit.className = 'map-pin-hit'
      hit.setAttribute('aria-label', `Open article: ${article.title.replace(/"/g, "'")}`)
      hit.innerHTML = articlePinSvg(article)

      const tooltip = document.createElement('div')
      tooltip.className = 'map-pin-tooltip'
      const imageUrl = escapeHtml(article.imageUrl)
      const location = escapeHtml(article.location)
      const title = escapeHtml(article.title)
      const summary = escapeHtml(article.summary.replace('AI Summary: ', ''))
      tooltip.innerHTML = `
        <img src="${imageUrl}" class="tooltip-img" alt="">
        <div class="tooltip-content">
          <div class="tooltip-meta">${location}</div>
          <h4>${title}</h4>
          <p>${summary}</p>
        </div>
      `

      hit.addEventListener('click', e => {
        e.stopPropagation()
        onArticleClickRef.current(article)
      })

      root.appendChild(hit)
      root.appendChild(tooltip)

      const marker = new maplibregl.Marker({
        element: root,
        anchor: 'bottom',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat(article.lngLat)
        .addTo(map)

      markersRef.current.push(marker)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
    }
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
