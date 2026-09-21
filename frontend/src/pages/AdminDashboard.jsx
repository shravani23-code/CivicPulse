import { useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import { motion, AnimatePresence } from 'framer-motion'

import toast from 'react-hot-toast'

import {
  Search,
  Inbox,
  SearchX,
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

import { API_BASE_URL } from '../config/api'

import { useAuth } from '../auth/useAuthContext'

import { useCountUp } from '../hooks/useCountUp'

import StatusTabs from '../components/StatusTabs'

import ComplaintDetailsModal from '../components/ComplaintDetailsModal'

import CopyButton from '../components/CopyButton'


// ======================================
// COLORS
// ======================================

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


// ======================================
// PRIORITY TIER
// ======================================

const SEVERITY_RANK = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
}


// ======================================
// SORT OPTIONS
// ======================================

const SORT_OPTIONS = [
  {
    value: 'priority-desc',
    label: 'Priority: High → Low (Priority Queue)'
  },
  {
    value: 'priority-asc',
    label: 'Priority: Low → High'
  },
  {
    value: 'severity-desc',
    label: 'Severity: Critical → Low'
  },
  {
    value: 'severity-asc',
    label: 'Severity: Low → Critical'
  },
  {
    value: 'newest',
    label: 'Newest First'
  },
  {
    value: 'oldest',
    label: 'Oldest First'
  }
]


// ======================================
// STATUS CSS CLASS
// ======================================

function statusToClass(status) {
  if (status === 'Resolved') return 'resolved'

  if (status === 'In Progress') return 'in-progress'

  return 'pending'
}


// ======================================
// ANIMATED STAT
// ======================================

function AnimatedStat({ value, loading }) {
  const counted = useCountUp(value)

  return (
    <strong>
      {loading ? '...' : counted}
    </strong>
  )
}


// ======================================
// PRIORITY COMPARATOR
//
// Priority order:
//
// 1. Higher tier
// 2. Higher score inside the tier
// 3. Older complaint first
// ======================================

function comparePriorityDescending(a, b) {
  const tierA = Number(a.priorityTier ?? SEVERITY_RANK[a.effectiveSeverity] ?? SEVERITY_RANK[a.severity] ?? 1)
  const tierB = Number(b.priorityTier ?? SEVERITY_RANK[b.effectiveSeverity] ?? SEVERITY_RANK[b.severity] ?? 1)

  if (tierA !== tierB) {
    return tierB - tierA
  }

  const scoreA = Number(a.priorityScore ?? a.priority ?? 0)
  const scoreB = Number(b.priorityScore ?? b.priority ?? 0)

  if (scoreA !== scoreB) {
    return scoreB - scoreA
  }

  const dateA = new Date(a.createdAt).getTime()
  const dateB = new Date(b.createdAt).getTime()

  return dateA - dateB
}


// ======================================
// PRIORITY ASCENDING
// ======================================

function comparePriorityAscending(a, b) {
  const result = comparePriorityDescending(a, b)

  return -result
}


// ======================================
// ADMIN DASHBOARD
// ======================================

function AdminDashboard() {

  const { token, logout } = useAuth()


  // ======================================
  // STATE
  // ======================================

  const [complaints, setComplaints] = useState([])

  const [mostUrgent, setMostUrgent] = useState(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [updatingId, setUpdatingId] = useState('')

  const [searchTerm, setSearchTerm] = useState('')

  const [statusFilter, setStatusFilter] = useState('All')

  const [severityFilter, setSeverityFilter] = useState('All')

  const [sortBy, setSortBy] = useState('priority-desc')

  const [selectedComplaint, setSelectedComplaint] = useState(null)


  // ======================================
  // FETCH COMPLAINTS
  //
  // IMPORTANT:
  //
  // /api/complaints
  //     → ALL complaints
  //     → used for dashboard statistics
  //     → includes Resolved complaints
  //
  // /api/complaints/priority
  //     → Max Heap
  //     → used only for Most Urgent Complaint
  // ======================================

  async function fetchComplaints() {

    try {

      setError('')


      // ==================================
      // 1. FETCH ALL COMPLAINTS
      // ==================================

      const allResponse = await fetch(
        `${API_BASE_URL}/api/complaints`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )


      const allData = await allResponse.json()


      if (!allResponse.ok) {

        throw new Error(
          allData.message ||
          'Failed to fetch complaints.'
        )

      }


      // /api/complaints returns an array
      setComplaints(
        Array.isArray(allData)
          ? allData
          : []
      )


      // ==================================
      // 2. FETCH MAX HEAP PRIORITY DATA
      // ==================================

      const priorityResponse = await fetch(
        `${API_BASE_URL}/api/complaints/priority`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )


      const priorityData = await priorityResponse.json()


      if (!priorityResponse.ok) {

        throw new Error(
          priorityData.message ||
          'Failed to fetch priority data.'
        )

      }


      // This is the top element from the Max Heap
      setMostUrgent(
        priorityData.mostUrgent || null
      )


    } catch (fetchError) {

      console.error(
        'Complaint fetch error:',
        fetchError
      )


      setError(
        'Unable to load complaints. Make sure the backend is running.'
      )


    } finally {

      setLoading(false)

    }

  }


  // ======================================
  // INITIAL FETCH
  // ======================================

  useEffect(() => {

    fetchComplaints()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // ======================================
  // UPDATE COMPLAINT STATUS
  // ======================================

  async function updateStatus(
    complaintId,
    newStatus
  ) {

    try {

      setUpdatingId(complaintId)


      const response = await fetch(
        `${API_BASE_URL}/api/complaints/${complaintId}/status`,
        {
          method: 'PUT',

          headers: {
            'Content-Type': 'application/json',

            Authorization:
              `Bearer ${token}`
          },

          body: JSON.stringify({
            status: newStatus
          })
        }
      )


      const data = await response.json()


      if (!response.ok) {

        throw new Error(
          data.message ||
          'Failed to update status.'
        )

      }


      // ==================================
      // REFRESH DATA
      // ==================================

      await fetchComplaints()


      toast.success(
        `Complaint ${complaintId} marked as ${newStatus}.`
      )


      setSelectedComplaint(current =>

        current &&
        current.id === complaintId

          ? {
              ...current,
              status: newStatus
            }

          : current

      )


    } catch (updateError) {

      toast.error(
        updateError.message ||
        'Failed to update complaint status.'
      )


    } finally {

      setUpdatingId('')

    }

  }


  // ======================================
  // STATISTICS
  //
  // These now use ALL complaints.
  // ======================================

  const totalComplaints =
    complaints.length


  const pendingComplaints =
    complaints.filter(
      complaint =>
        complaint.status === 'Pending'
    ).length


  const resolvedComplaints =
    complaints.filter(
      complaint =>
        complaint.status === 'Resolved'
    ).length


  // ======================================
  // HIGH PRIORITY
  //
  // New priority system:
  //
  // Critical = tier 4
  // High     = tier 3
  //
  // Therefore High Priority means:
  // tier >= 3
  //
  // Resolved complaints can still be shown
  // here because this is a dashboard statistic.
  // ======================================

  const highPriorityComplaints =
    complaints.filter(complaint => {

      const tier =
        Number(
          complaint.priorityTier ??
          SEVERITY_RANK[
            complaint.effectiveSeverity
          ] ??
          SEVERITY_RANK[
            complaint.severity
          ] ??
          1
        )

      return tier >= 3

    }).length


  // ======================================
  // STATUS COUNTS
  // ======================================

  const statusCounts = useMemo(() => ({

    All:
      complaints.length,

    Pending:
      complaints.filter(
        c => c.status === 'Pending'
      ).length,

    'In Progress':
      complaints.filter(
        c => c.status === 'In Progress'
      ).length,

    Resolved:
      complaints.filter(
        c => c.status === 'Resolved'
      ).length

  }), [complaints])


  // ======================================
  // FILTERED + SORTED TABLE DATA
  // ======================================

  const filteredComplaints = useMemo(() => {

    const term =
      searchTerm
        .trim()
        .toLowerCase()


    const filtered =
      complaints.filter(complaint => {

        const matchesSearch =
          !term ||

          complaint.id
            ?.toLowerCase()
            .includes(term) ||

          complaint.title
            ?.toLowerCase()
            .includes(term)


        const matchesStatus =
          statusFilter === 'All' ||
          complaint.status === statusFilter


        const matchesSeverity =
          severityFilter === 'All' ||
          complaint.severity === severityFilter


        return (
          matchesSearch &&
          matchesStatus &&
          matchesSeverity
        )

      })


    // ==================================
    // PRIORITY DESCENDING
    //
    // Higher tier
    // → higher score
    // → older complaint
    // ==================================

    if (
      sortBy ===
      'priority-desc'
    ) {

      return [...filtered].sort(
        comparePriorityDescending
      )

    }


    // ==================================
    // OTHER SORTS
    // ==================================

    const sorted = [...filtered]


    if (
      sortBy ===
      'priority-asc'
    ) {

      sorted.sort(
        comparePriorityAscending
      )

    }

    else if (
      sortBy ===
      'severity-desc'
    ) {

      sorted.sort(
        (a, b) => {

          const rankA =
            SEVERITY_RANK[
              a.effectiveSeverity ||
              a.severity
            ] || 1

          const rankB =
            SEVERITY_RANK[
              b.effectiveSeverity ||
              b.severity
            ] || 1

          return rankB - rankA

        }
      )

    }

    else if (
      sortBy ===
      'severity-asc'
    ) {

      sorted.sort(
        (a, b) => {

          const rankA =
            SEVERITY_RANK[
              a.effectiveSeverity ||
              a.severity
            ] || 1

          const rankB =
            SEVERITY_RANK[
              b.effectiveSeverity ||
              b.severity
            ] || 1

          return rankA - rankB

        }
      )

    }

    else if (
      sortBy ===
      'newest'
    ) {

      sorted.sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      )

    }

    else if (
      sortBy ===
      'oldest'
    ) {

      sorted.sort(
        (a, b) =>
          new Date(a.createdAt) -
          new Date(b.createdAt)
      )

    }


    return sorted

  }, [
    complaints,
    searchTerm,
    statusFilter,
    severityFilter,
    sortBy
  ])


  // ======================================
  // STATUS CHART DATA
  // ======================================

  const statusChartData =
    useMemo(() => ([

      {
        name: 'Pending',
        value:
          complaints.filter(
            c => c.status === 'Pending'
          ).length
      },

      {
        name: 'In Progress',
        value:
          complaints.filter(
            c => c.status === 'In Progress'
          ).length
      },

      {
        name: 'Resolved',
        value:
          complaints.filter(
            c => c.status === 'Resolved'
          ).length
      }

    ]), [complaints])


  // ======================================
  // SEVERITY CHART DATA
  // ======================================

  const severityChartData =
    useMemo(() => ([

      {
        name: 'Low',
        value:
          complaints.filter(
            c => c.severity === 'Low'
          ).length
      },

      {
        name: 'Medium',
        value:
          complaints.filter(
            c => c.severity === 'Medium'
          ).length
      },

      {
        name: 'High',
        value:
          complaints.filter(
            c => c.severity === 'High'
          ).length
      },

      {
        name: 'Critical',
        value:
          complaints.filter(
            c =>
              c.severity ===
              'Critical'
          ).length
      }

    ]), [complaints])


  // ======================================
  // RENDER
  // ======================================

  return (

    <div className="admin-page">


      {/* ==================================
          HEADER
      ================================== */}

      <div className="admin-header">

        <Link
          to="/"
          className="back-link"
        >
          ← Back to CivicPulse
        </Link>


        <p className="hero-label">
          CIVICPULSE ADMIN
        </p>


        <h1>
          Complaint <span>Dashboard</span>
        </h1>


        <p>
          Monitor, prioritize and process civic complaints.
        </p>


        <div className="dashboard-actions">

          <button
            type="button"
            className="secondary-button"
            onClick={logout}
          >
            Log Out
          </button>

        </div>

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

              <AnimatedStat
                value={totalComplaints}
                loading={loading}
              />

            </div>


            <div className="stat-card">

              <span>
                Pending
              </span>

              <AnimatedStat
                value={pendingComplaints}
                loading={loading}
              />

            </div>


            <div className="stat-card">

              <span>
                High Priority
              </span>

              <AnimatedStat
                value={highPriorityComplaints}
                loading={loading}
              />

            </div>


            <div className="stat-card">

              <span>
                Resolved
              </span>

              <AnimatedStat
                value={resolvedComplaints}
                loading={loading}
              />

            </div>

          </div>


          {/* ==================================
              MOST URGENT COMPLAINT
              MAX HEAP PEEK
          ================================== */}

          {mostUrgent && (

            <motion.div
              className="urgent-callout"

              initial={{
                opacity: 0,
                y: 10
              }}

              animate={{
                opacity: 1,
                y: 0
              }}

              transition={{
                duration: 0.3
              }}

              onClick={() =>
                setSelectedComplaint(
                  mostUrgent
                )
              }
            >

              <div className="urgent-callout-icon">

                <Zap size={18} />

              </div>


              <div className="urgent-callout-body">

                <span className="urgent-callout-label">
                  Most Urgent Complaint
                </span>


                <strong>
                  {mostUrgent.id}
                  {' — '}
                  {mostUrgent.title}
                </strong>


                <span className="urgent-callout-meta">

                  {mostUrgent.effectiveSeverity ||
                    mostUrgent.severity}

                  {' severity · Priority score '}

                  {mostUrgent.priority}

                </span>

              </div>

            </motion.div>

          )}


          {/* ==================================
              DISTRIBUTION CHARTS
          ================================== */}

          {totalComplaints > 0 && (

            <div className="charts-grid">


              {/* STATUS */}

              <div className="chart-card">

                <h3>
                  Status Distribution
                </h3>


                <ResponsiveContainer
                  width="100%"
                  height={160}
                >

                  <BarChart
                    data={statusChartData}
                    layout="vertical"
                    margin={{
                      left: 10,
                      right: 20
                    }}
                  >

                    <XAxis
                      type="number"
                      hide
                      allowDecimals={false}
                    />


                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{
                        fontSize: 12,
                        fill: '#59665e'
                      }}
                      axisLine={false}
                      tickLine={false}
                    />


                    <Tooltip
                      cursor={{
                        fill:
                          'rgba(63,125,88,0.06)'
                      }}
                    />


                    <Bar
                      dataKey="value"
                      radius={[
                        0,
                        6,
                        6,
                        0
                      ]}
                      barSize={16}
                    >

                      {statusChartData.map(
                        entry => (

                          <Cell
                            key={
                              entry.name
                            }
                            fill={
                              STATUS_COLORS[
                                entry.name
                              ]
                            }
                          />

                        )
                      )}

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>


              {/* SEVERITY */}

              <div className="chart-card">

                <h3>
                  Severity Distribution
                </h3>


                <ResponsiveContainer
                  width="100%"
                  height={160}
                >

                  <BarChart
                    data={
                      severityChartData
                    }
                    layout="vertical"
                    margin={{
                      left: 10,
                      right: 20
                    }}
                  >

                    <XAxis
                      type="number"
                      hide
                      allowDecimals={false}
                    />


                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{
                        fontSize: 12,
                        fill: '#59665e'
                      }}
                      axisLine={false}
                      tickLine={false}
                    />


                    <Tooltip
                      cursor={{
                        fill:
                          'rgba(63,125,88,0.06)'
                      }}
                    />


                    <Bar
                      dataKey="value"
                      radius={[
                        0,
                        6,
                        6,
                        0
                      ]}
                      barSize={16}
                    >

                      {severityChartData.map(
                        entry => (

                          <Cell
                            key={
                              entry.name
                            }
                            fill={
                              SEVERITY_COLORS[
                                entry.name
                              ]
                            }
                          />

                        )
                      )}

                    </Bar>

                  </BarChart>

                </ResponsiveContainer>

              </div>

            </div>

          )}


          {/* ==================================
              COMPLAINTS TABLE
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


            {/* STATUS TABS */}

            {complaints.length > 0 && (

              <StatusTabs
                value={statusFilter}
                onChange={setStatusFilter}
                counts={statusCounts}
              />

            )}


            {/* ==================================
                FILTERS
            ================================== */}

            {complaints.length > 0 && (

              <>


                <div className="admin-search">

                  <label htmlFor="admin-search-input">
                    Search
                  </label>


                  <div
                    style={{
                      position:
                        'relative'
                    }}
                  >

                    <Search
                      size={16}
                      style={{
                        position:
                          'absolute',
                        left: '14px',
                        top: '50%',
                        transform:
                          'translateY(-50%)',
                        color:
                          '#9aa59e'
                      }}
                    />


                    <input
                      id="admin-search-input"
                      type="text"
                      placeholder="Search by complaint ID or title..."
                      value={searchTerm}
                      onChange={
                        event =>
                          setSearchTerm(
                            event.target.value
                          )
                      }
                      style={{
                        paddingLeft:
                          '38px'
                      }}
                    />

                  </div>

                </div>


                <div className="admin-filters">


                  {/* SEVERITY FILTER */}

                  <div className="filter-group">

                    <label>
                      Severity
                    </label>


                    <select
                      value={
                        severityFilter
                      }
                      onChange={
                        event =>
                          setSeverityFilter(
                            event.target.value
                          )
                      }
                    >

                      <option value="All">
                        All Severities
                      </option>

                      <option value="Low">
                        Low
                      </option>

                      <option value="Medium">
                        Medium
                      </option>

                      <option value="High">
                        High
                      </option>

                      <option value="Critical">
                        Critical
                      </option>

                    </select>

                  </div>


                  {/* SORT */}

                  <div className="filter-group">

                    <label>
                      Sort By
                    </label>


                    <select
                      value={sortBy}
                      onChange={
                        event =>
                          setSortBy(
                            event.target.value
                          )
                      }
                    >

                      {SORT_OPTIONS.map(
                        option => (

                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {option.label}
                          </option>

                        )
                      )}

                    </select>

                  </div>

                </div>


                <p className="filter-result">

                  Showing{' '}
                  <strong>
                    {
                      filteredComplaints.length
                    }
                  </strong>{' '}

                  of{' '}

                  <strong>
                    {
                      complaints.length
                    }
                  </strong>{' '}

                  complaints

                </p>

              </>

            )}


            {/* ==================================
                EMPTY STATE
            ================================== */}

            {complaints.length === 0 ? (

              <div className="empty-state">

                <Inbox
                  size={28}
                  style={{
                    marginBottom:
                      '8px'
                  }}
                />

                <div>
                  No complaints available.
                </div>

              </div>

            ) : filteredComplaints.length === 0 ? (

              <div className="empty-state">

                <SearchX
                  size={28}
                  style={{
                    marginBottom:
                      '8px'
                  }}
                />

                <div>
                  No complaints match your filters.
                </div>

              </div>

            ) : (


              /* ==================================
                  COMPLAINT TABLE
              ================================== */

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


                <AnimatePresence
                  initial={false}
                >

                  {filteredComplaints.map(
                    (complaint, index) => (

                      <motion.div

                        className="table-row table-row-clickable"

                        key={
                          complaint.id
                        }

                        initial={{
                          opacity: 0,
                          y: 8
                        }}

                        animate={{
                          opacity: 1,
                          y: 0
                        }}

                        transition={{
                          duration: 0.25,
                          delay:
                            Math.min(
                              index,
                              8
                            ) * 0.03
                        }}

                        onClick={() =>
                          setSelectedComplaint(
                            complaint
                          )
                        }
                      >


                        {/* ID */}

                        <span className="complaint-id-cell">

                          {complaint.id}


                          <span
                            onClick={
                              event =>
                                event.stopPropagation()
                            }
                          >

                            <CopyButton
                              value={
                                complaint.id
                              }
                            />

                          </span>

                        </span>


                        {/* TITLE */}

                        <span>
                          {complaint.title}
                        </span>


                        {/* SEVERITY */}

                        <span>

                          <span
                            className={
                              `severity-badge ${
                                (
                                  complaint.effectiveSeverity ||
                                  complaint.severity ||
                                  ''
                                ).toLowerCase()
                              }`
                            }
                          >

                            {
                              complaint.effectiveSeverity ||
                              complaint.severity
                            }

                          </span>

                        </span>


                        {/* PRIORITY */}

                        <span className="priority-value">

                          {complaint.priority}

                        </span>


                        {/* STATUS */}

                        <span className="status-cell">


                          <span
                            className={
                              `status-badge ${
                                statusToClass(
                                  complaint.status
                                )
                              }`
                            }
                          >

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

                            onClick={
                              event =>
                                event.stopPropagation()
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


      {/* ==================================
          COMPLAINT DETAILS MODAL
      ================================== */}

      {selectedComplaint && (

        <ComplaintDetailsModal

          complaint={
            selectedComplaint
          }

          onClose={() =>
            setSelectedComplaint(null)
          }

          isAdmin

          onStatusChange={
            updateStatus
          }

          updating={
            updatingId ===
            selectedComplaint.id
          }

        />

      )}

    </div>

  )

}


export default AdminDashboard