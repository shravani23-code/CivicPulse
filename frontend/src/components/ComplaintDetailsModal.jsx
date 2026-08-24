import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import CopyButton from './CopyButton'
import ImageGallery from './ImageGallery'
import LocationMap from './LocationMap'

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
