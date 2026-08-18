import { useEffect, useState } from 'react'
import '../App.css'

function AdminDashboard() {

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')


  async function fetchComplaints() {

    try {

      const response = await fetch(
        'http://localhost:5000/api/complaints'
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || 'Failed to fetch complaints'
        )
      }

      setComplaints(data)

    } catch (error) {

      console.error(error)

      setError(
        'Unable to load complaints. Make sure the backend is running.'
      )

    } finally {

      setLoading(false)

    }
  }


  useEffect(() => {
    fetchComplaints()
  }, [])


  // Statistics

  const totalComplaints = complaints.length

  const pendingComplaints = complaints.filter(
    complaint => complaint.status === 'Pending'
  ).length

  const resolvedComplaints = complaints.filter(
    complaint => complaint.status === 'Resolved'
  ).length

  const highPriorityComplaints = complaints.filter(
    complaint => Number(complaint.priority) >= 30
  ).length


  // Sort by priority

  const sortedComplaints = [...complaints].sort(
    (a, b) =>
      Number(b.priority || 0) -
      Number(a.priority || 0)
  )


  return (
    <div className="admin-page">

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


      {/* Loading */}

      {loading && (
        <div className="admin-message">
          Loading complaints...
        </div>
      )}


      {/* Error */}

      {error && (
        <div className="track-error">
          {error}
        </div>
      )}


      {!loading && !error && (

        <>

          {/* Statistics */}

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


          {/* Priority List */}

          <div className="admin-card">

            <div className="admin-card-header">

              <div>

                <p className="result-label">
                  DSA PRIORITY VIEW
                </p>

                <h2>
                  Highest Priority Complaints
                </h2>

              </div>

              <button
                className="refresh-button"
                onClick={fetchComplaints}
              >
                Refresh
              </button>

            </div>


            {sortedComplaints.length === 0 ? (

              <div className="empty-state">
                No complaints available.
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


                {sortedComplaints.map(
                  (complaint) => (

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
                        {complaint.priority}
                      </span>

                      <span>
                        {complaint.status}
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