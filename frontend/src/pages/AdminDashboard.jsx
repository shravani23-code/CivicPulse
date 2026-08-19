import { useEffect, useState } from 'react'
import '../App.css'

function AdminDashboard() {

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [searchTerm, setSearchTerm] = useState('')

  const [statusFilter, setStatusFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')


  // ======================================
  // FETCH PRIORITY-RANKED COMPLAINTS
  // ======================================

  async function fetchComplaints() {

    try {

      setLoading(true)
      setError('')

      const response = await fetch(
        'http://localhost:5000/api/complaints/priority'
      )

      const data = await response.json()

      if (!response.ok) {

        throw new Error(
          data.message ||
          'Failed to fetch complaints'
        )

      }

      setComplaints(
        data.complaints || []
      )

    } catch (error) {

      console.error(error)

      setError(
        'Unable to load complaints. Make sure the backend and C++ priority engine are running.'
      )

    } finally {

      setLoading(false)

    }

  }


  useEffect(() => {
    fetchComplaints()
  }, [])


  // ======================================
  // UPDATE STATUS
  // ======================================

  async function updateStatus(
    complaintId,
    newStatus
  ) {

    try {

      const response = await fetch(

        `http://localhost:5000/api/complaints/${complaintId}/status`,

        {
          method: 'PUT',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            status: newStatus
          })
        }

      )

      const data =
        await response.json()


      if (!response.ok) {

        throw new Error(
          data.message ||
          'Failed to update status'
        )

      }


      setComplaints(
        previousComplaints =>

          previousComplaints.map(
            complaint =>

              complaint.id === complaintId

                ? {
                    ...complaint,
                    status: newStatus
                  }

                : complaint
          )
      )

    } catch (error) {

      console.error(error)

      setError(
        'Failed to update complaint status.'
      )

    }

  }


  // ======================================
  // STATISTICS
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


  const highPriorityComplaints =
    complaints.filter(
      complaint =>
        Number(complaint.priority) >= 30
    ).length


  // ======================================
  // PRIORITY LABEL
  // ======================================

  function getPriorityLabel(priority) {

    const value = Number(priority)

    if (value >= 40) {
      return 'Critical'
    }

    if (value >= 30) {
      return 'High'
    }

    if (value >= 20) {
      return 'Medium'
    }

    return 'Low'
  }


  // ======================================
  // CATEGORY OPTIONS
  // ======================================

  const categories = [

    'All',

    ...new Set(
      complaints
        .map(
          complaint =>
            complaint.category
        )
        .filter(Boolean)
    )

  ]


  // ======================================
  // HASH MAP
  // ======================================
  // Complaint ID → Complaint
  //
  // This gives us fast direct lookup
  // when the user searches an exact ID.

  const complaintMap = new Map(

    complaints.map(
      complaint => [
        complaint.id.toLowerCase(),
        complaint
      ]
    )

  )


  // ======================================
  // FILTER + SEARCH COMPLAINTS
  // ======================================

  const filteredComplaints =
    complaints.filter(
      complaint => {

        // -------------------------------
        // SEARCH
        // -------------------------------

        const search =
          searchTerm
            .trim()
            .toLowerCase()


        let searchMatches = true


        if (search !== '') {

          // Exact Complaint ID lookup
          const exactComplaint =
            complaintMap.get(search)


          if (exactComplaint) {

            searchMatches =
              exactComplaint.id === complaint.id

          } else {

            // General search
            searchMatches =

              complaint.id
                ?.toLowerCase()
                .includes(search)

              ||

              complaint.title
                ?.toLowerCase()
                .includes(search)

              ||

              complaint.category
                ?.toLowerCase()
                .includes(search)

              ||

              complaint.location
                ?.toLowerCase()
                .includes(search)

          }

        }


        // -------------------------------
        // STATUS
        // -------------------------------

        const statusMatches =
          statusFilter === 'All' ||
          complaint.status === statusFilter


        // -------------------------------
        // SEVERITY
        // -------------------------------

        const severityMatches =
          severityFilter === 'All' ||
          complaint.severity === severityFilter


        // -------------------------------
        // CATEGORY
        // -------------------------------

        const categoryMatches =
          categoryFilter === 'All' ||
          complaint.category === categoryFilter


        return (

          searchMatches &&

          statusMatches &&

          severityMatches &&

          categoryMatches

        )

      }
    )


  // ======================================
  // CLEAR ALL SEARCH + FILTERS
  // ======================================

  function clearFilters() {

    setSearchTerm('')
    setStatusFilter('All')
    setSeverityFilter('All')
    setCategoryFilter('All')

  }


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
          Monitor and prioritize civic complaints.
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

              <strong>
                {totalComplaints}
              </strong>

            </div>


            <div className="stat-card">

              <span>
                Pending
              </span>

              <strong>
                {pendingComplaints}
              </strong>

            </div>


            <div className="stat-card">

              <span>
                High Priority
              </span>

              <strong>
                {highPriorityComplaints}
              </strong>

            </div>


            <div className="stat-card">

              <span>
                Resolved
              </span>

              <strong>
                {resolvedComplaints}
              </strong>

            </div>

          </div>


          {/* ==================================
              PRIORITY CARD
          ================================== */}

          <div className="admin-card">


            <div className="admin-card-header">

              <div>

                <p className="result-label">
                  DSA PRIORITY VIEW
                </p>

                <h2>
                  Highest Priority Complaints
                </h2>

                <p>
                  Ranked using C++ Max Heap
                </p>

              </div>


              <button
                className="refresh-button"
                onClick={fetchComplaints}
              >
                Refresh
              </button>

            </div>


            {/* ==================================
                SEARCH
            ================================== */}

            <div className="admin-search">

              <label>
                Search Complaints
              </label>

              <input

                type="text"

                value={searchTerm}

                onChange={
                  event =>
                    setSearchTerm(
                      event.target.value
                    )
                }

                placeholder="Search by ID, title, category or location..."

              />

            </div>


            {/* ==================================
                FILTERS
            ================================== */}

            <div className="admin-filters">


              {/* STATUS */}

              <div className="filter-group">

                <label>
                  Status
                </label>

                <select
                  value={statusFilter}
                  onChange={
                    event =>
                      setStatusFilter(
                        event.target.value
                      )
                  }
                >

                  <option value="All">
                    All
                  </option>

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

              </div>


              {/* SEVERITY */}

              <div className="filter-group">

                <label>
                  Severity
                </label>

                <select
                  value={severityFilter}
                  onChange={
                    event =>
                      setSeverityFilter(
                        event.target.value
                      )
                  }
                >

                  <option value="All">
                    All
                  </option>

                  <option value="Critical">
                    Critical
                  </option>

                  <option value="High">
                    High
                  </option>

                  <option value="Medium">
                    Medium
                  </option>

                  <option value="Low">
                    Low
                  </option>

                </select>

              </div>


              {/* CATEGORY */}

              <div className="filter-group">

                <label>
                  Category
                </label>

                <select
                  value={categoryFilter}
                  onChange={
                    event =>
                      setCategoryFilter(
                        event.target.value
                      )
                  }
                >

                  {categories.map(
                    category => (

                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>

                    )
                  )}

                </select>

              </div>


              {/* CLEAR */}

              <button
                className="refresh-button"
                onClick={clearFilters}
              >
                Clear Filters
              </button>

            </div>


            {/* ==================================
                RESULT COUNT
            ================================== */}

            <p className="filter-result">

              Showing{' '}

              <strong>
                {filteredComplaints.length}
              </strong>

              {' '}of{' '}

              <strong>
                {complaints.length}
              </strong>

              {' '}complaints

            </p>


            {/* ==================================
                EMPTY STATE
            ================================== */}

            {filteredComplaints.length === 0 ? (

              <div className="empty-state">

                No complaints match your search
                or selected filters.

              </div>

            ) : (


              /* ==================================
                 TABLE
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


                {filteredComplaints.map(
                  complaint => (

                    <div
                      className="table-row"
                      key={complaint.id}
                    >

                      <span>
                        {complaint.id}
                      </span>


                      <span>
                        {complaint.title}
                      </span>


                      <span>
                        {complaint.severity}
                      </span>


                      <span className="priority-value">

                        {Number(
                          complaint.priority
                        )}

                        {' - '}

                        {getPriorityLabel(
                          complaint.priority
                        )}

                      </span>


                      <span>

                        <select

                          value={
                            complaint.status ||
                            'Pending'
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

                      </span>

                    </div>

                  )
                )}

              </div>

            )}

          </div>

        </>

      )}

    </div>

  )
}

export default AdminDashboard