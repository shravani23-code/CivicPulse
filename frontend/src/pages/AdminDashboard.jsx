import { useEffect, useState } from 'react'
import '../App.css'

function AdminDashboard() {

  const [complaints, setComplaints] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [updatingId, setUpdatingId] = useState('')


  // ======================================
  // FETCH MAX HEAP PRIORITY DATA
  // ======================================

  async function fetchComplaints() {

    try {

      setError('')

      const response =
        await fetch(
          'http://localhost:5000/api/complaints/priority'
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
          `http://localhost:5000/api/complaints/${complaintId}/status`,
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
  // STATISTICS
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
              MAX HEAP
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


            {complaints.length === 0 ? (

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


                {complaints.map(
                  complaint => (

                    <div
                      className="table-row"
                      key={
                        complaint.id
                      }
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