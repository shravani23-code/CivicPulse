import { useState } from 'react'
import '../App.css'

function TrackComplaint() {

  const [complaintId, setComplaintId] = useState('')
  const [complaint, setComplaint] = useState(null)
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)


  // ======================================
  // SEARCH COMPLAINT
  // ======================================

  async function handleSearch(event) {

    event.preventDefault()

    setError('')
    setComplaint(null)

    const id =
      complaintId.trim()

    if (!id) {

      setError(
        'Please enter a Complaint ID.'
      )

      return
    }

    setIsSearching(true)

    try {

      const response =
        await fetch(
          `http://localhost:5000/api/complaints/${id}`
        )


      const data =
        await response.json()


      if (!response.ok) {

        setError(
          data.message ||
          'Complaint not found.'
        )

        return
      }


      console.log(
        'Complaint received from backend:',
        data
      )


      setComplaint(data)

    } catch (error) {

      console.error(
        'Backend connection error:',
        error
      )


      setError(
        'Unable to connect to CivicPulse server. Make sure the backend is running.'
      )

    } finally {

      setIsSearching(false)

    }

  }


  // ======================================
  // STATUS HELPERS
  // ======================================

  function getStatusClass(status) {

    if (status === 'Resolved') {
      return 'resolved'
    }

    if (status === 'In Progress') {
      return 'in-progress'
    }

    return 'pending'
  }


  // ======================================
  // FORMAT DATE
  // ======================================

  function formatDate(date) {

    if (!date) {
      return 'Not available'
    }


    return new Date(
      date
    ).toLocaleString(
      [],
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    )

  }


  // ======================================
  // RENDER
  // ======================================

  return (

    <div className="track-page">


      {/* ==================================
          HEADER
      ================================== */}

      <div className="track-header">

        <a
          href="/"
          className="back-link"
        >
          ← Back to CivicPulse
        </a>


        <p className="hero-label">
          COMPLAINT TRACKING
        </p>


        <h1>
          Track Your <span>Complaint</span>
        </h1>


        <p>
          Enter your Complaint ID to check the current status.
        </p>

      </div>


      {/* ==================================
          SEARCH CARD
      ================================== */}

      <div className="track-card">

        <form
          onSubmit={handleSearch}
        >

          <label>
            Complaint ID
          </label>


          <div className="track-input-row">

            <input

              type="text"

              placeholder="Example: CP12345678"

              value={
                complaintId
              }

              onChange={
                (event) =>
                  setComplaintId(
                    event.target.value
                  )
              }

            />


            <button

              type="submit"

              className="submit-button"

              disabled={
                isSearching
              }

            >

              {isSearching
                ? 'Searching...'
                : 'Track Complaint'}

            </button>

          </div>

        </form>


        {/* ==================================
            ERROR
        ================================== */}

        {error && (

          <div className="track-error">
            {error}
          </div>

        )}


        {/* ==================================
            COMPLAINT RESULT
        ================================== */}

        {complaint && (

          <div className="complaint-result">


            {/* ==================================
                RESULT HEADER
            ================================== */}

            <div className="result-header">

              <div>

                <p className="result-label">
                  COMPLAINT FOUND
                </p>


                <h2>
                  {complaint.id}
                </h2>

              </div>


              <span
                className={
                  `status-badge ${getStatusClass(
                    complaint.status
                  )}`
                }
              >

                {complaint.status}

              </span>

            </div>


            {/* ==================================
                COMPLAINT INFORMATION
            ================================== */}

            <div className="result-grid">


              <div className="result-item">

                <span>
                  Title
                </span>

                <strong>
                  {complaint.title}
                </strong>

              </div>


              <div className="result-item">

                <span>
                  Category
                </span>

                <strong>
                  {complaint.category}
                </strong>

              </div>


              <div className="result-item">

                <span>
                  Severity
                </span>

                <strong>
                  {complaint.severity}
                </strong>

              </div>


              <div className="result-item">

                <span>
                  Priority
                </span>

                <strong>
                  {complaint.priority ||
                    'Not calculated'}
                </strong>

              </div>


              <div className="result-item">

                <span>
                  Location
                </span>

                <strong>
                  {complaint.location}
                </strong>

              </div>


              <div className="result-item">

                <span>
                  Submitted
                </span>

                <strong>
                  {formatDate(
                    complaint.createdAt
                  )}
                </strong>

              </div>

            </div>


            {/* ==================================
                DESCRIPTION
            ================================== */}

            <div className="submitted-description">

              <span>
                Description
              </span>


              <p>
                {complaint.description}
              </p>

            </div>


            {/* ==================================
                COMPLAINT HISTORY
            ================================== */}

            <div className="status-section">


              <div className="history-heading">

                <div>

                  <p className="result-label">
                    COMPLAINT HISTORY
                  </p>

                  <h3>
                    Resolution Timeline
                  </h3>

                </div>


                <span className="history-count">

                  {complaint.history
                    ? complaint.history.length
                    : 0}

                  {' '}
                  updates

                </span>

              </div>


              {/* ==================================
                  NO HISTORY
              ================================== */}

              {!complaint.history ||
              complaint.history.length === 0 ? (

                <div className="history-empty">

                  No status history is available
                  for this complaint yet.

                </div>

              ) : (


                /* ==================================
                   TIMELINE
                ================================== */

                <div className="history-timeline">


                  {complaint.history.map(
                    (item, index) => (

                      <div
                        className="history-item"
                        key={`${item.timestamp}-${index}`}
                      >


                        {/* Timeline line */}

                        {index <
                          complaint.history.length - 1 && (

                          <div className="history-line">
                          </div>

                        )}


                        {/* Timeline node */}

                        <div
                          className={
                            `history-node ${
                              getStatusClass(
                                item.status
                              )
                            }`
                          }
                        >

                          ✓

                        </div>


                        {/* Timeline content */}

                        <div className="history-content">


                          <div className="history-top">

                            <strong>
                              {item.status}
                            </strong>


                            <span>
                              {formatDate(
                                item.timestamp
                              )}
                            </span>

                          </div>


                          <p>

                            {item.description ||
                              `Complaint status changed to ${item.status}.`}

                          </p>

                        </div>

                      </div>

                    )
                  )}

                </div>

              )}

            </div>


          </div>

        )}

      </div>

    </div>

  )
}


export default TrackComplaint