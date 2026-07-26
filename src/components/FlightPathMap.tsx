import { useMemo } from 'react'
import { buildFlightTrack, type FlightTrackPoint } from '../lib/gps'
import type { ParsedLog } from '../types'

const WIDTH = 1000
const HEIGHT = 590
const PADDING = 52
const MAX_RENDERED_POINTS = 1400

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

function formatAltitude(value: number, unit?: string): string {
  return `${value.toFixed(Math.abs(value) < 100 ? 1 : 0)}${unit ? ` ${unit}` : ''}`
}

function altitudeColor(altitude: number | undefined, minimum: number | undefined, maximum: number | undefined): string {
  if (altitude === undefined || minimum === undefined || maximum === undefined) return 'hsl(161 75% 55%)'
  const ratio = maximum === minimum ? 0.5 : Math.max(0, Math.min(1, (altitude - minimum) / (maximum - minimum)))
  return `hsl(${205 - ratio * 193} 86% 58%)`
}

function thinSegment(points: FlightTrackPoint[]): FlightTrackPoint[] {
  if (points.length <= MAX_RENDERED_POINTS) return points
  const result: FlightTrackPoint[] = []
  const step = (points.length - 1) / (MAX_RENDERED_POINTS - 1)
  for (let index = 0; index < MAX_RENDERED_POINTS; index += 1) result.push(points[Math.round(index * step)])
  return result
}

export function FlightPathMap({ parsed }: { parsed: ParsedLog }) {
  const track = useMemo(() => buildFlightTrack(parsed), [parsed])
  if (!track || !track.segments.length) return null

  const latitudeSpan = Math.max(track.maxLatitude - track.minLatitude, 0.000001)
  const longitudeScale = Math.max(0.05, Math.cos(((track.minLatitude + track.maxLatitude) / 2) * Math.PI / 180))
  const longitudeSpan = Math.max((track.maxLongitude - track.minLongitude) * longitudeScale, 0.000001)
  const contentWidth = WIDTH - PADDING * 2
  const contentHeight = HEIGHT - PADDING * 2
  const scale = Math.min(contentWidth / longitudeSpan, contentHeight / latitudeSpan)
  const drawnWidth = longitudeSpan * scale
  const drawnHeight = latitudeSpan * scale
  const offsetX = PADDING + (contentWidth - drawnWidth) / 2
  const offsetY = PADDING + (contentHeight - drawnHeight) / 2
  const project = (point: FlightTrackPoint) => ({
    x: offsetX + (point.longitude - track.minLongitude) * longitudeScale * scale,
    y: offsetY + (track.maxLatitude - point.latitude) * scale
  })
  const start = track.segments[0][0]
  const finishSegment = track.segments[track.segments.length - 1]
  const finish = finishSegment[finishSegment.length - 1]
  const startPosition = project(start)
  const finishPosition = project(finish)
  const hasAltitude = track.minAltitude !== undefined && track.maxAltitude !== undefined

  return <section className="analysis-panel flight-map-panel" aria-labelledby="flight-path-title">
    <div className="panel-heading flight-map-heading">
      <div><span className="eyebrow">Position trace</span><h2 id="flight-path-title">Flight path</h2><p>Route colors show altitude from low to high. The map is drawn locally from this log.</p></div>
      <div className="flight-map-stats">
        <span><small>GPS distance</small><strong>{formatDistance(track.distanceMeters)}</strong></span>
        <span><small>Coordinate coverage</small><strong>{(track.coordinateCoverage * 100).toFixed(1)}%</strong></span>
        {hasAltitude && <span><small>Altitude range</small><strong>{formatAltitude(track.minAltitude!, track.channels.altitudeUnit)} – {formatAltitude(track.maxAltitude!, track.channels.altitudeUnit)}</strong></span>}
      </div>
    </div>
    <div className="flight-map-wrap">
      <svg className="flight-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="GPS flight path colored by altitude">
        <title>GPS flight path</title>
        <desc>The recorded flight route. Blue portions are lower altitude and red portions are higher altitude.</desc>
        <rect className="flight-map-background" width={WIDTH} height={HEIGHT} rx="14" />
        {[0.2, 0.4, 0.6, 0.8].map((fraction) => <g key={fraction} className="flight-map-grid"><line x1={WIDTH * fraction} y1={0} x2={WIDTH * fraction} y2={HEIGHT} /><line x1={0} y1={HEIGHT * fraction} x2={WIDTH} y2={HEIGHT * fraction} /></g>)}
        <text className="flight-map-north" x={WIDTH - 35} y={34} textAnchor="middle">N ↑</text>
        {track.segments.map((segment, segmentIndex) => {
          const points = thinSegment(segment)
          return <g key={segmentIndex}>{points.slice(1).map((point, index) => {
            const previous = points[index]
            const from = project(previous)
            const to = project(point)
            const altitude = point.altitude === undefined || previous.altitude === undefined ? point.altitude ?? previous.altitude : (point.altitude + previous.altitude) / 2
            return <line key={`${segmentIndex}-${point.index}`} className="flight-path-segment" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={altitudeColor(altitude, track.minAltitude, track.maxAltitude)} />
          })}</g>
        })}
        <circle className="flight-map-marker start" cx={startPosition.x} cy={startPosition.y} r="9" />
        <text className="flight-map-marker-label" x={startPosition.x + 14} y={startPosition.y - 12}>Start</text>
        <circle className="flight-map-marker finish" cx={finishPosition.x} cy={finishPosition.y} r="9" />
        <text className="flight-map-marker-label" x={finishPosition.x + 14} y={finishPosition.y + 24}>Finish</text>
        <text className="flight-map-coordinate" x={18} y={HEIGHT - 18}>{track.minLatitude.toFixed(5)}, {track.minLongitude.toFixed(5)}</text>
        <text className="flight-map-coordinate" x={WIDTH - 18} y={HEIGHT - 18} textAnchor="end">{track.maxLatitude.toFixed(5)}, {track.maxLongitude.toFixed(5)}</text>
      </svg>
    </div>
    <div className="flight-altitude-legend" aria-label={hasAltitude ? 'Altitude color scale' : 'Altitude unavailable'}>
      {hasAltitude ? <><span>{formatAltitude(track.minAltitude!, track.channels.altitudeUnit)}</span><i /><span>{formatAltitude(track.maxAltitude!, track.channels.altitudeUnit)}</span></> : <><span>Flight path</span><i className="unavailable" /><span>Altitude unavailable</span></>}
    </div>
  </section>
}
