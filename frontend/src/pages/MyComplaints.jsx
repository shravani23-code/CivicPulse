import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, SearchX } from 'lucide-react'
import '../App.css'
import { API_BASE_URL } from '../config/api'
import { useAuth } from '../auth/useAuthContext'
import StatusTabs from '../components/StatusTabs'
import ComplaintDetailsModal from '../components/ComplaintDetailsModal'
import CopyButton from '../components/CopyButton'

function statusToClass(status) {
  if (status === 'Resolved') return 'resolved'
  if (status === 'In Progress') return 'in-progress'
  return 'pending'
}

function MyComplaints() {

  const { token, user, logout } = useAuth()

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedComplaint, setSelectedComplaint] = useState(null)

  useEffect(() => {

    async function fetchMine() {

      try {

        setError('')

        const response = await fetch(`${API_BASE_URL}/api/complaints/mine`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load your complaints.')
        }

        setComplaints(data)

      } catch (fetchError) {

        setError(fetchError.message)

      } finally {

        setLoading(false)

      }

    }

    fetchMine()

  }, [token])

  const filteredComplaints = useMemo(() => {

    if (statusFilter === 'All') return complaints

    return complaints.filter(complaint => complaint.status === statusFilter)

  }, [complaints, statusFilter])

  const counts = useMemo(() => ({

    All: complaints.length,
    Pending: complaints.filter(c => c.status === 'Pending').length,
    'In Progress': complaints.filter(c => c.status === 'In Progress').length,
    Resolved: complaints.filter(c => c.status === 'Resolved').length

  }), [complaints])

  return (
    <div className="admin-page">

      <div className="admin-header">

        <Link to="/" className="back-link">← Back to CivicPulse</Link>

        <p className="hero-label">MY COMPLAINTS</p>

        <h1>Welcome, <span>{user?.name}</span></h1>

        <p>Every complaint you&apos;ve submitted, and where it stands right now.</p>

        <div className="dashboard-actions">
          <Link to="/report-complaint" className="submit-button">Report a New Complaint</Link>
          <button type="button" className="secondary-button" onClick={logout}>Log Out</button>
        </div>

      </div>

      {loading && <div className="admin-message">Loading your complaints...</div>}

      {error && <div className="track-error">{error}</div>}

      {!loading && !error && (

        <div className="admin-card">

          <div className="admin-card-header">
            <h2>Your Complaints</h2>
          </div>

          {complaints.length > 0 && (
            <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={counts} />
          )}

          {complaints.length === 0 ? (

            <div className="empty-state">
              <Inbox size={28} style={{ marginBottom: '8px' }} />
              <div>You haven&apos;t submitted any complaints yet.</div>
              <Link to="/report-complaint" className="primary-button" style={{ marginTop: '14px' }}>
                Report Your First Complaint
              </Link>
            </div>

          ) : filteredComplaints.length === 0 ? (

            <div className="empty-state">
              <SearchX size={28} style={{ marginBottom: '8px' }} />
              <div>No complaints in this category.</div>
            </div>

          ) : (

            <div className="complaint-table">

              <div className="table-row table-heading">
                <span>Complaint ID</span>
                <span>Title</span>
                <span>Category</span>
                <span>Severity</span>
                <span>Status</span>
              </div>

              <AnimatePresence initial={false}>

                {filteredComplaints.map((complaint, index) => (

                  <motion.div
                    className="table-row table-row-clickable"
                    key={complaint.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
                    onClick={() => setSelectedComplaint(complaint)}
                  >

                    <span className="complaint-id-cell">
                      {complaint.id}
                      <span onClick={event => event.stopPropagation()}>
                        <CopyButton value={complaint.id} />
                      </span>
                    </span>

                    <span>{complaint.title}</span>

                    <span>{complaint.category}</span>

                    <span>
                      <span className={`severity-badge ${complaint.severity?.toLowerCase()}`}>
                        {complaint.severity}
                      </span>
                    </span>

                    <span className="status-cell">
                      <span className={`status-badge ${statusToClass(complaint.status)}`}>
                        {complaint.status}
                      </span>
                    </span>

                  </motion.div>

                ))}

              </AnimatePresence>

            </div>

          )}

        </div>

      )}

      {selectedComplaint && (
        <ComplaintDetailsModal
          complaint={selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
          isAdmin={false}
        />
      )}

    </div>
  )
}

export default MyComplaints
