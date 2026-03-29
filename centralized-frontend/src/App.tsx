import { useEffect, useState } from 'react'
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import './App.css'

type Coordinates = {
  lat: number
  lng: number
}

type PositionSnapshot = Coordinates & {
  accuracy: number
  recordedAt: number
}

type HospitalMatch = Coordinates & {
  ip: string | null
}

type BannerTone = 'info' | 'success' | 'error'

type MapViewportControllerProps = {
  ambulanceLocation: PositionSnapshot | null
  hospitalMatch: HospitalMatch | null
}

const apiBaseUrl = (import.meta.env.VITE_CENTRALISED_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const defaultCenter: [number, number] = [42.6977, 23.3219]

const ambulanceMarkerIcon = divIcon({
  className: 'map-pin-shell',
  html: `
    <span class="map-pin map-pin--ambulance">
      <span class="map-pin__halo"></span>
      <span class="map-pin__body">
        <svg class="map-pin__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 14V9.5A1.5 1.5 0 0 1 4.5 8H11v8H3Z" />
          <path d="M11 10h4.4a1.5 1.5 0 0 1 1.17.56L19 13.5V18h-8v-8Z" />
          <path d="M15 8V5" />
          <path d="M13.5 6.5h3" />
          <circle cx="7" cy="18" r="1.75" />
          <circle cx="17" cy="18" r="1.75" />
        </svg>
      </span>
    </span>
  `,
  iconSize: [54, 54],
  iconAnchor: [18, 48],
  popupAnchor: [10, -40],
})

const hospitalMarkerIcon = divIcon({
  className: 'map-pin-shell',
  html: `
    <span class="map-pin map-pin--hospital">
      <span class="map-pin__halo"></span>
      <span class="map-pin__body">
        <svg class="map-pin__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 20V7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5V20" />
          <path d="M9 12h6" />
          <path d="M12 9v6" />
          <path d="M9 20v-4h6v4" />
        </svg>
      </span>
    </span>
  `,
  iconSize: [54, 54],
  iconAnchor: [18, 48],
  popupAnchor: [10, -40],
})

function MapViewportController({ ambulanceLocation, hospitalMatch }: MapViewportControllerProps) {
  const map = useMap()

  useEffect(() => {
    if (ambulanceLocation && hospitalMatch) {
      map.fitBounds(
        latLngBounds(
          [ambulanceLocation.lat, ambulanceLocation.lng],
          [hospitalMatch.lat, hospitalMatch.lng],
        ),
        {
          padding: [56, 56],
          maxZoom: 14,
        },
      )
      return
    }

    const focusPoint = ambulanceLocation ?? hospitalMatch

    if (!focusPoint) {
      return
    }

    map.flyTo([focusPoint.lat, focusPoint.lng], 13, {
      animate: true,
      duration: 1.1,
    })
  }, [ambulanceLocation, hospitalMatch, map])

  return null
}

function formatCoordinate(value: number) {
  return value.toFixed(5)
}

function formatDistanceKm(value: number) {
  if (value < 1) {
    return `${Math.round(value * 1000)} m`
  }

  return `${value.toFixed(1)} km`
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function calculateDistanceKm(origin: Coordinates, destination: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLat = toRadians(destination.lat - origin.lat)
  const deltaLng = toRadians(destination.lng - origin.lng)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(deltaLng / 2) ** 2

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function buildDirectionsUrl(origin: Coordinates, destination: Coordinates) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`)
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`)
  url.searchParams.set('travelmode', 'driving')
  return url.toString()
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Allow location access to route the ambulance.'
    case error.POSITION_UNAVAILABLE:
      return 'The current position could not be determined. Move to an open area and try again.'
    case error.TIMEOUT:
      return 'Location lookup timed out. Please retry once the device has a stronger signal.'
    default:
      return 'Location lookup failed. Please try again.'
  }
}

function getCurrentLocation() {
  return new Promise<PositionSnapshot>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support geolocation.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          recordedAt: position.timestamp,
        })
      },
      (error) => {
        reject(new Error(getGeolocationErrorMessage(error)))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  })
}

function getApiErrorMessage(rawResponse: string, status: number) {
  if (rawResponse.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawResponse) as {
        message?: string | string[]
      }

      if (Array.isArray(parsed.message) && parsed.message.length > 0) {
        return parsed.message.join(' ')
      }

      if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
        return parsed.message
      }
    } catch {
      return rawResponse
    }
  }

  return status >= 500 ? 'The hospital search is unavailable right now. Please try again.' : 'We could not find a hospital right now.'
}

async function findBestFitHospital(origin: Coordinates) {
  const url = new URL('/api/find-best-fit-hospital', apiBaseUrl)
  url.searchParams.set('lat', String(origin.lat))
  url.searchParams.set('lng', String(origin.lng))

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })
  const rawResponse = await response.text()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(rawResponse, response.status))
  }

  if (rawResponse.trim().length === 0) {
    throw new Error('No suitable nearby hospital is available right now.')
  }

  const parsed = JSON.parse(rawResponse) as {
    ip?: unknown
    lat?: unknown
    lng?: unknown
  }

  if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') {
    throw new Error('The dispatch service returned invalid hospital coordinates.')
  }

  return {
    ip: typeof parsed.ip === 'string' ? parsed.ip : null,
    lat: parsed.lat,
    lng: parsed.lng,
  } satisfies HospitalMatch
}

function App() {
  const [ambulanceLocation, setAmbulanceLocation] = useState<PositionSnapshot | null>(null)
  const [hospitalMatch, setHospitalMatch] = useState<HospitalMatch | null>(null)
  const [activeAction, setActiveAction] = useState<'locate' | 'refresh' | 'find' | 'navigate' | null>(null)
  const [bannerTone, setBannerTone] = useState<BannerTone>('info')
  const [bannerMessage, setBannerMessage] = useState('Getting the ambulance location.')

  const hasLocation = ambulanceLocation !== null
  const routeDistance =
    ambulanceLocation && hospitalMatch ? calculateDistanceKm(ambulanceLocation, hospitalMatch) : null

  const ambulanceSummary = ambulanceLocation
    ? `${formatCoordinate(ambulanceLocation.lat)}, ${formatCoordinate(ambulanceLocation.lng)}`
    : 'Waiting for live location'

  const hospitalSummary =
    hospitalMatch && routeDistance !== null
      ? `${formatDistanceKm(routeDistance)} away`
      : 'Not matched yet'

  const mapSummary = hospitalMatch
    ? `Best hospital found${routeDistance !== null ? `, ${formatDistanceKm(routeDistance)} away.` : '.'}`
    : hasLocation
      ? 'Location is ready. Find the best hospital, then start navigation.'
      : 'Waiting for the crew location.'

  useEffect(() => {
    async function locateOnOpen() {
      setActiveAction('locate')
      setBannerTone('info')
      setBannerMessage('Getting the ambulance location.')

      try {
        const nextLocation = await getCurrentLocation()
        setAmbulanceLocation(nextLocation)
        setHospitalMatch(null)
        setBannerTone('success')
        setBannerMessage('Ambulance location is ready.')
      } catch (error) {
        setBannerTone('error')
        setBannerMessage(error instanceof Error ? error.message : 'Location lookup failed.')
      } finally {
        setActiveAction(null)
      }
    }

    const initialRequestTimeout = window.setTimeout(() => {
      void locateOnOpen()
    }, 0)

    return () => {
      window.clearTimeout(initialRequestTimeout)
    }
  }, [])

  async function refreshLocation() {
    setActiveAction('refresh')
    setBannerTone('info')
    setBannerMessage('Updating the ambulance location.')

    try {
      const nextLocation = await getCurrentLocation()
      setAmbulanceLocation(nextLocation)
      setHospitalMatch(null)
      setBannerTone('success')
      setBannerMessage('Ambulance location updated.')
    } catch (error) {
      setBannerTone('error')
      setBannerMessage(error instanceof Error ? error.message : 'Location lookup failed.')
    } finally {
      setActiveAction(null)
    }
  }

  async function handleFindHospital() {
    setActiveAction('find')
    setBannerTone('info')
    setBannerMessage('Checking the latest location and finding the best nearby hospital.')

    try {
      const liveLocation = await getCurrentLocation()
      setAmbulanceLocation(liveLocation)

      const bestFitHospital = await findBestFitHospital(liveLocation)
      setHospitalMatch(bestFitHospital)
      setBannerTone('success')
      const distanceLabel = formatDistanceKm(calculateDistanceKm(liveLocation, bestFitHospital))
      setBannerMessage(`Best hospital found, ${distanceLabel} away.`)
    } catch (error) {
      setBannerTone('error')
      setBannerMessage(
        error instanceof Error ? error.message : 'Unable to find a hospital right now.',
      )
    } finally {
      setActiveAction(null)
    }
  }

  function handleNavigateToHospital() {
    if (!ambulanceLocation || !hospitalMatch) {
      setBannerTone('error')
      setBannerMessage('Find a hospital first before opening navigation.')
      return
    }

    setActiveAction('navigate')
    const directionsTab = window.open(buildDirectionsUrl(ambulanceLocation, hospitalMatch), '_blank')

    if (!directionsTab) {
      setBannerTone('error')
      setBannerMessage('Google Maps could not open in a new tab. Allow pop-ups and try again.')
      setActiveAction(null)
      return
    }

    directionsTab.opener = null
    directionsTab.focus()
    setBannerTone('success')
    setBannerMessage('Opening Google Maps in a new tab.')
    setActiveAction(null)
  }

  return (
    <main className="dispatch-app">
      <section className="dispatch-panel">
        <header className="dispatch-header">
          <div className="dispatch-kicker">
            <span className="dispatch-kicker__dot" />
            Centralised Dispatch
          </div>

          <h1 className="dispatch-title">Help the crew reach care without losing time.</h1>

          <p className="dispatch-copy">
            The location is checked as soon as the page opens, so the team can update it if needed and head straight
            to the hospital that makes the most sense.
          </p>

          <div className="dispatch-actions">
            <button
              className="dispatch-button dispatch-button--secondary"
              disabled={activeAction !== null}
              onClick={() => {
                void refreshLocation()
              }}
              type="button"
            >
              {activeAction === 'locate'
                ? 'Getting location...'
                : activeAction === 'refresh'
                  ? 'Updating location...'
                  : 'Update location'}
            </button>

            <button
              className="dispatch-button dispatch-button--route"
              disabled={activeAction !== null}
              onClick={() => {
                void handleFindHospital()
              }}
              type="button"
            >
              {activeAction === 'find' ? 'Finding hospital...' : 'Find hospital'}
            </button>
          </div>

          <div className={`dispatch-banner dispatch-banner--${bannerTone}`} aria-live="polite">
            {bannerMessage}
          </div>
        </header>

        <div className="dispatch-map-card">
          <div className="dispatch-map-meta">
            <div className="dispatch-map-meta__item">
              <span className="dispatch-map-meta__label">Ambulance</span>
              <strong>{ambulanceSummary}</strong>
            </div>

            <div className="dispatch-map-meta__item">
              <span className="dispatch-map-meta__label">Hospital</span>
              <strong>{hospitalSummary}</strong>
            </div>

            <div className="dispatch-map-meta__item">
              <span className="dispatch-map-meta__label">Updated</span>
              <strong>{ambulanceLocation ? formatTime(ambulanceLocation.recordedAt) : 'No live fix yet'}</strong>
            </div>
          </div>

          <div className="dispatch-map-shell">
            <MapContainer center={defaultCenter} className="dispatch-map" scrollWheelZoom zoom={12} zoomControl={false}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ZoomControl position="bottomright" />
              <MapViewportController ambulanceLocation={ambulanceLocation} hospitalMatch={hospitalMatch} />

              {ambulanceLocation ? (
                <>
                  <Circle
                    center={[ambulanceLocation.lat, ambulanceLocation.lng]}
                    color="#c84747"
                    fillColor="#c84747"
                    fillOpacity={0.1}
                    radius={Math.max(ambulanceLocation.accuracy, 30)}
                    weight={1.5}
                  />
                  <Marker icon={ambulanceMarkerIcon} position={[ambulanceLocation.lat, ambulanceLocation.lng]}>
                    <Popup>
                      Ambulance location
                      <br />
                      {formatCoordinate(ambulanceLocation.lat)}, {formatCoordinate(ambulanceLocation.lng)}
                    </Popup>
                  </Marker>
                </>
              ) : null}

              {hospitalMatch ? (
                <Marker icon={hospitalMarkerIcon} position={[hospitalMatch.lat, hospitalMatch.lng]}>
                  <Popup>
                    Best-fit hospital
                    <br />
                    {formatCoordinate(hospitalMatch.lat)}, {formatCoordinate(hospitalMatch.lng)}
                  </Popup>
                </Marker>
              ) : null}

              {ambulanceLocation && hospitalMatch ? (
                <Polyline
                  color="#0b736f"
                  pathOptions={{
                    dashArray: '10 12',
                    lineCap: 'round',
                    opacity: 0.8,
                    weight: 4,
                  }}
                  positions={[
                    [ambulanceLocation.lat, ambulanceLocation.lng],
                    [hospitalMatch.lat, hospitalMatch.lng],
                  ]}
                />
              ) : null}
            </MapContainer>
          </div>

          <div className="dispatch-map-footer">
            <p className="dispatch-map-footer__copy">{mapSummary}</p>

            <button
              className="dispatch-button dispatch-button--route dispatch-button--map"
              disabled={!hospitalMatch || activeAction !== null}
              onClick={handleNavigateToHospital}
              type="button"
            >
              {activeAction === 'navigate' ? 'Opening navigation...' : 'Navigate to hospital'}
            </button>
          </div>

          <div className="dispatch-legend" aria-label="Map legend">
            <span className="dispatch-legend__item">
              <span className="dispatch-legend__swatch dispatch-legend__swatch--ambulance" />
              Ambulance
            </span>
            <span className="dispatch-legend__item">
              <span className="dispatch-legend__swatch dispatch-legend__swatch--hospital" />
              Hospital
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
