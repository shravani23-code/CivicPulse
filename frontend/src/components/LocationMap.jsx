import { MapPin } from 'lucide-react'

// Small embedded OpenStreetMap preview — no API key required. Falls back
// to a plain message when a complaint has no GPS coordinates (older
// complaints, or GPS was unavailable/denied at submission time).
function LocationMap({ latitude, longitude }) {

  const hasCoordinates =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)

  if (!hasCoordinates) {

    return (
      <div className="location-map-empty">
        <MapPin size={16} />
        <span>No GPS location was captured for this complaint.</span>
      </div>
    )

  }

  const delta = 0.01

  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta
  ].join(',')

  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${latitude},${longitude}`

  return (
    <div className="location-map">
      <iframe
        title="Complaint location map"
        src={src}
        loading="lazy"
      />
    </div>
  )

}

export default LocationMap
