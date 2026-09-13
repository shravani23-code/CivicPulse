import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import CopyButton from './CopyButton'
import ImageGallery from './ImageGallery'
import LocationMap from './LocationMap'
import RouteGraph from './RouteGraph'
import { API_BASE_URL } from '../config/api'
import { useAuth } from '../auth/useAuthContext'

function statusToClass(status) {
  if (status === 'Resolved') return 'resolved'
  if (status === 'In Progress') return 'in-progress'
  return 'pending'
}

// Shared complaint detail view for both the Admin Dashboard and the
// citizen's My Complaints page. `isAdmin` toggles the status-change
// control and citizen contact info — citizens viewing their own
// complaint don't need to see their own contact details repeated back,
// and never see anyone else's.
function ComplaintDetailsModal({ complaint, onClose, isAdmin = false, onStatusChange, updating = false }) {

  const { token } = useAuth()

  // Admin gets the full Dijkstra/BFS breakdown plus the graph to draw;
  // citizens get a reduced response-status summary with no graph/route
  // internals (see the two backend endpoints in complaintRoutes.js).
  const [routeInfo, setRouteInfo] = useState(null)
  const [responseStatus, setResponseStatus] = useState(null)

  useEffect(() => {

    if (!complaint) return

    let cancelled = false

    const endpoint = isAdmin
      ? `${API_BASE_URL}/api/complaints/${complaint.id}/route`
      : `${API_BASE_URL}/api/complaints/${complaint.id}/response-status`

    fetch(endpoint, {
      headers: isAdmin ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(response => response.json())
      .then(data => {
        if (cancelled) return
        if (isAdmin) setRouteInfo({ route: data.route || null, graph: data.graph || null })
        else setResponseStatus(data.status || null)
      })
      .catch(() => {
        if (cancelled) return
        if (isAdmin) setRouteInfo(null)
        else setResponseStatus(null)
      })

    return () => {
      cancelled = true
    }

  }, [isAdmin, complaint?.id, token])

  if (!complaint) return null

  return (
    <AnimatePresence>

      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >

        <motion.div
          className="complaint-modal"
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={event => event.stopPropagation()}
        >

          <div className="complaint-modal-header">

            <div className="complaint-modal-id">
              <p className="result-label">COMPLAINT DETAILS</p>
              <h2>
                {complaint.id}
                <CopyButton value={complaint.id} />
              </h2>
            </div>

            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close complaint details"
            >
              <X size={20} />
            </button>

          </div>

          <div className="complaint-modal-body">

            <div className="result-header">
              <h3>{complaint.title}</h3>
              <span className={`status-badge ${statusToClass(complaint.status)}`}>
                {complaint.status}
              </span>
            </div>

            <div className="result-grid">

              <div className="result-item">
                <span>Category</span>
                <strong>{complaint.category}</strong>
              </div>

              <div className="result-item">
                <span>Severity</span>
                <strong>{complaint.severity}</strong>
              </div>

              <div className="result-item">
                <span>Priority Score</span>
                <strong>{complaint.priority}</strong>
              </div>

              <div className="result-item">
                <span>Location</span>
                <strong>{complaint.location}</strong>
              </div>

              <div className="result-item">
                <span>Submitted</span>
                <strong>
                  {complaint.createdAt
                    ? new Date(complaint.createdAt).toLocaleString()
                    : 'Not available'}
                </strong>
              </div>

              {isAdmin && complaint.citizenName && (
                <div className="result-item">
                  <span>Submitted By</span>
                  <strong>
                    {complaint.citizenName}
                    {complaint.citizenEmail ? ` (${complaint.citizenEmail})` : ''}
                  </strong>
                </div>
              )}

            </div>

            <div className="submitted-description">
              <span>Description</span>
              <p>{complaint.description}</p>
            </div>

            {isAdmin && onStatusChange && (

              <div className="modal-status-change">

                <label htmlFor="modal-status-select">Change Status</label>

                <select
                  id="modal-status-select"
                  value={complaint.status || 'Pending'}
                  disabled={updating}
                  onChange={event => onStatusChange(complaint.id, event.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

              </div>

            )}

            {isAdmin && routeInfo && (

              <div className="modal-section">
                <span className="modal-section-label">Response Route</span>

                {routeInfo.route ? (

                  <>

                    <RouteGraph
                      graph={routeInfo.graph}
                      path={routeInfo.route.path}
                      source={routeInfo.route.source}
                      destination={routeInfo.route.destination}
                    />

                    <div className="result-grid">

                      <div className="result-item">
                        <span>Response Source</span>
                        <strong>{routeInfo.route.source}</strong>
                      </div>

                      <div className="result-item">
                        <span>Destination</span>
                        <strong>{routeInfo.route.destination}</strong>
                      </div>

                      <div className="result-item">
                        <span>Shortest Route</span>
                        <strong>{routeInfo.route.path.join(' → ')}</strong>
                      </div>

                      <div className="result-item">
                        <span>Distance</span>
                        <strong>{routeInfo.route.distanceKm} km</strong>
                      </div>

                      <div className="result-item">
                        <span>Estimated Response</span>
                        <strong>~{routeInfo.route.etaMinutes} min</strong>
                      </div>

                      {routeInfo.route.nearbyAreas.length > 0 && (
                        <div className="result-item">
                          <span>Nearby Areas to Inspect</span>
                          <strong>{routeInfo.route.nearbyAreas.join(', ')}</strong>
                        </div>
                      )}

                    </div>

                  </>

                ) : (

                  <p className="route-unavailable">
                    Response route currently unavailable for this location.
                  </p>

                )}

              </div>

            )}

            {!isAdmin && responseStatus && (

              <div className="modal-section">
                <span className="modal-section-label">Response Status</span>

                <div className="response-status-list">

                  <div className="response-status-item">✓ Complaint received</div>

                  {responseStatus.available ? (

                    <>
                      <div className="response-status-item">✓ Location identified</div>
                      <div className="response-status-item">✓ Response team assigned</div>
                      <div className="response-status-eta">
                        → Estimated arrival: ~{responseStatus.etaMinutes} min ({responseStatus.distanceKm} km away)
                      </div>
                    </>

                  ) : (

                    <div className="response-status-item pending">
                      → Response time will be shared once the location is confirmed
                    </div>

                  )}

                </div>

              </div>

            )}

            <div className="modal-section">
              <span className="modal-section-label">Location Map</span>
              <LocationMap latitude={complaint.latitude} longitude={complaint.longitude} />
            </div>

            <div className="modal-section">
              <span className="modal-section-label">Photos</span>
              <ImageGallery images={complaint.images} />
            </div>

          </div>

        </motion.div>

      </motion.div>

    </AnimatePresence>
  )
}

export default ComplaintDetailsModal
