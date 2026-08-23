import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Inbox,
  SearchX,
  Star,
  Zap
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts'
import '../App.css'
import { useCountUp } from '../hooks/useCountUp'

const STATUS_COLORS = {
  Pending: '#d9a441',
  'In Progress': '#6b9b7d',
  Resolved: '#3f7d58'
}

const SEVERITY_COLORS = {
  Low: '#3f7d58',
  Medium: '#c99a2e',
  High: '#cf7a39',
  Critical: '#c1503f'
}

function statusToClass(status) {
  if (status === 'Resolved') return 'resolved'
  if (status === 'In Progress') return 'in-progress'
  return 'pending'
}

function starsForPriority(priority) {
  const value = Number(priority)
  if (value >= 40) return 5
  if (value >= 30) return 4
  if (value >= 20) return 3
  return 1
}

function AnimatedStat({ value, loading }) {
  const counted = useCountUp(value)
  return <strong>{loading ? '...' : counted}</strong>
}

function AdminDashboard() {

  const [complaints, setComplaints] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [updatingId, setUpdatingId] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')

  const [poppedId, setPoppedId] = useState('')


  // ======================================
  // FETCH MAX HEAP PRIORITY DATA
  // ======================================

  async function fetchComplaints() {

    try {

      setError('')

      const response =
        await fetch(
          'http://https://civicpulse-backend-nt8q.onrender.com/api/complaints/priority'
        )


      const data =
        await response.json()


      if (!response.ok) {

        throw new Error(
          data.message ||
          'Failed to fetch complaints.'
        )

      }


      setComplaints(
        data.complaints || []
      )


    } catch (error) {

      console.error(
        'Complaint fetch error:',
        error
      )


      setError(
        'Unable to load complaints. Make sure the backend is running.'
      )


    } finally {

      setLoading(false)

    }

  }


  // ======================================
  // LOAD DATA
  // ======================================

  useEffect(() => {

    fetchComplaints()

  }, [])


  // ======================================
  // UPDATE COMPLAINT STATUS
  // ======================================

  async function updateStatus(
    complaintId,
    newStatus
  ) {

    try {

      setUpdatingId(
        complaintId
      )


      const response =
        await fetch(
          `http://https://civicpulse-backend-nt8q.onrender.com/api/complaints/${complaintId}/status`,
          {

            method:
              'PUT',

            headers: {

              'Content-Type':
                'application/json'

            },

            body:
              JSON.stringify({

                status:
                  newStatus

              })

          }
        )


      const data =
        await response.json()


      if (!response.ok) {

        throw new Error(
          data.message ||
          'Failed to update status.'
        )

      }


      // ==================================
      // REFRESH MAX HEAP DATA
      // ==================================

      await fetchComplaints()


      console.log(
        'Status updated:',
        data
      )


    } catch (error) {

      console.error(
        'Status update error:',
        error
      )


      alert(
        error.message ||
        'Failed to update complaint status.'
      )


    } finally {

      setUpdatingId('')

    }

  }


  // ======================================
  // STATISTICS (always reflect the full dataset, independent of filters)
  // ======================================

  const totalComplaints =
    complaints.length


  const pendingComplaints =
    complaints.filter(
      complaint =>
        complaint.status ===
        'Pending'
    ).length


  const resolvedComplaints =
    complaints.filter(
      complaint =>
        complaint.status ===
        'Resolved'
    ).length


  const highPriorityComplaints =
    complaints.filter(
      complaint =>
        Number(
          complaint.priority
        ) >= 30
    ).length


  // ======================================
  // FILTERED TABLE DATA
  // ======================================

  const filteredComplaints = useMemo(() => {

    const term = searchTerm.trim().toLowerCase()

    return complaints.filter(complaint => {

      const matchesSearch =
        !term ||
        complaint.id?.toLowerCase().includes(term) ||
        complaint.title?.toLowerCase().includes(term)

      const matchesStatus =
        statusFilter === 'All' ||
        complaint.status === statusFilter

      const matchesSeverity =
        severityFilter === 'All' ||
        complaint.severity === severityFilter

      return matchesSearch && matchesStatus && matchesSeverity

    })

  }, [complaints, searchTerm, statusFilter, severityFilter])


  // ======================================
  // DISTRIBUTION CHART DATA (derived from the real dataset)
  // ======================================

  const statusChartData = useMemo(() => ([
    { name: 'Pending', value: complaints.filter(c => c.status === 'Pending').length },
    { name: 'In Progress', value: complaints.filter(c => c.status === 'In Progress').length },
    { name: 'Resolved', value: complaints.filter(c => c.status === 'Resolved').length }
  ]), [complaints])

  const severityChartData = useMemo(() => ([
    { name: 'Low', value: complaints.filter(c => c.severity === 'Low').length },
    { name: 'Medium', value: complaints.filter(c => c.severity === 'Medium').length },
    { name: 'High', value: complaints.filter(c => c.severity === 'High').length },
    { name: 'Critical', value: complaints.filter(c => c.severity === 'Critical').length }
  ]), [complaints])


  // ======================================
  // PRIORITY QUEUE BUCKETS (real max-heap output, grouped for display)
  // ======================================

  const priorityBuckets = useMemo(() => {

    const high = complaints.filter(c => Number(c.priority) >= 30)
    const medium = complaints.filter(c => Number(c.priority) === 20)
    const low = complaints.filter(c => Number(c.priority) <= 10)

    return [
      { key: 'high', label: 'High Priority', items: high },
      { key: 'medium', label: 'Medium Priority', items: medium },
      { key: 'low', label: 'Low Priority', items: low }
    ]

  }, [complaints])


  const nextInQueue = complaints[0]


  function handleSimulatePop() {

    if (!nextInQueue) return

    setPoppedId(nextInQueue.id)

    setTimeout(() => setPoppedId(''), 1400)

  }


  // ======================================
  // RENDER
  // ======================================

  return (

    <div className="admin-page">

      {/* ==================================
          HEADER
      ================================== */}

      <div className="admin-header">

        <a
          href="/"
          className="back-link"
        >
          ← Back to CivicPulse
        </a>


        <p className="hero-label">
          CIVICPULSE ADMIN
        </p>


        <h1>
          Complaint <span>Dashboard</span>
        </h1>


        <p>
          Monitor, prioritize and process civic complaints.
        </p>

      </div>


      {/* ==================================
          LOADING
      ================================== */}

      {loading && (

        <div className="admin-message">
          Loading complaints...
        </div>

      )}


      {/* ==================================
          ERROR
      ================================== */}

      {error && (

        <div className="track-error">
          {error}
        </div>

      )}


      {!loading && !error && (

        <>

          {/* ==================================
              STATISTICS
          ================================== */}

          <div className="stats-grid">

            <div className="stat-card">

              <span>
                Total Complaints
              </span>

              <AnimatedStat value={totalComplaints} loading={loading} />

            </div>


            <div className="stat-card">

              <span>
                Pending
              </span>

              <AnimatedStat value={pendingComplaints} loading={loading} />

            </div>


            <div className="stat-card">

              <span>
                High Priority
              </span>

              <AnimatedStat value={highPriorityComplaints} loading={loading} />

            </div>


            <div className="stat-card">

              <span>
                Resolved
              </span>

              <AnimatedStat value={resolvedComplaints} loading={loading} />

            </div>

          </div>


          {/* ==================================
              DISTRIBUTION CHARTS
          ================================== */}

          {totalComplaints > 0 && (

            <div className="charts-grid">

              <div className="chart-card">

                <h3>Status Distribution</h3>

                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={statusChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 12, fill: '#59665e' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip cursor={{ fill: 'rgba(63,125,88,0.06)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                      {statusChartData.map(entry => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

              </div>


              <div className="chart-card">

                <h3>Severity Distribution</h3>

                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={severityChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 12, fill: '#59665e' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip cursor={{ fill: 'rgba(63,125,88,0.06)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                      {severityChartData.map(entry => (
                        <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

              </div>

            </div>

          )}


          {/* ==================================
              MAX HEAP TABLE
          ================================== */}

          <div className="admin-card">

            <div className="admin-card-header">

              <div>

                
                <h2>
                 Complaints
                </h2>

              </div>


              <button
                className="refresh-button"
                onClick={
                  fetchComplaints
                }
              >
                Refresh
              </button>

            </div>


            {/* ==================================
                FILTERS
            ================================== */}

            {complaints.length > 0 && (

              <>

                <div className="admin-search">

                  <label htmlFor="admin-search-input">
                    Search
                  </label>

                  <div style={{ position: 'relative' }}>

                    <Search
                      size={16}
                      style={{
                        position: 'absolute',
                        left: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#9aa59e'
                      }}
                    />

                    <input
                      id="admin-search-input"
                      type="text"
                      placeholder="Search by complaint ID or title..."
                      value={searchTerm}
                      onChange={event => setSearchTerm(event.target.value)}
                      style={{ paddingLeft: '38px' }}
                    />

                  </div>

                </div>


                <div className="admin-filters">

                  <div className="filter-group">
                    <label>Status</label>
                    <select
                      value={statusFilter}
                      onChange={event => setStatusFilter(event.target.value)}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Severity</label>
                    <select
                      value={severityFilter}
                      onChange={event => setSeverityFilter(event.target.value)}
                    >
                      <option value="All">All Severities</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                </div>


                <p className="filter-result">
                  Showing <strong>{filteredComplaints.length}</strong> of <strong>{complaints.length}</strong> complaints
                </p>

              </>

            )}


            {complaints.length === 0 ? (

              <div className="empty-state">
                <Inbox size={28} style={{ marginBottom: '8px' }} />
                <div>No complaints available.</div>
              </div>

            ) : filteredComplaints.length === 0 ? (

              <div className="empty-state">
                <SearchX size={28} style={{ marginBottom: '8px' }} />
                <div>No complaints match your filters.</div>
              </div>

            ) : (

              <div className="complaint-table">

                <div className="table-row table-heading">

                  <span>
                    Complaint ID
                  </span>

                  <span>
                    Title
                  </span>

                  <span>
                    Severity
                  </span>

                  <span>
                    Priority
                  </span>

                  <span>
                    Status
                  </span>

                </div>


                <AnimatePresence initial={false}>

                  {filteredComplaints.map(
                    (complaint, index) => (

                      <motion.div
                        className="table-row"
                        key={
                          complaint.id
                        }
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
                      >

                        <span>
                          {complaint.id}
                        </span>


                        <span>
                          {complaint.title}
                        </span>


                        <span>
                          <span className={`severity-badge ${complaint.severity?.toLowerCase()}`}>
                            {complaint.severity}
                          </span>
                        </span>


                        <span className="priority-value">

                          {complaint.priority}

                        </span>


                        <span className="status-cell">

                          <span className={`status-badge ${statusToClass(complaint.status)}`}>
                            {complaint.status}
                          </span>

                          <select
                            value={
                              complaint.status ||
                              'Pending'
                            }

                            disabled={
                              updatingId ===
                              complaint.id
                            }

                            onChange={
                              event =>
                                updateStatus(
                                  complaint.id,
                                  event.target.value
                                )
                            }
                          >

                            <option value="Pending">
                              Pending
                            </option>

                            <option value="In Progress">
                              In Progress
                            </option>

                            <option value="Resolved">
                              Resolved
                            </option>

                          </select>


                          {updatingId ===
                            complaint.id && (

                            <small>
                              Updating...
                            </small>

                          )}

                        </span>

                      </motion.div>

                    )
                  )}

                </AnimatePresence>

              </div>

            )}

          </div>


         

        </>

      )}

    </div>

  )

}

export default AdminDashboard
