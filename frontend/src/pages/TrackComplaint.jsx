import { useState } from 'react'
import '../App.css'

function TrackComplaint() {

  const [complaintId, setComplaintId] = useState('')
  const [complaint, setComplaint] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)


  async function handleSearch(event) {

    event.preventDefault()

    setError('')
    setComplaint(null)
    setHistory([])

    const id = complaintId.trim()

    if (!id) {

      setError(
        'Please enter a Complaint ID.'
      )

      return
    }


    setIsSearching(true)


    try {

      // ==================================
      // GET COMPLAINT
      // ==================================

      const complaintResponse =
        await fetch(
          `http://localhost:5000/api/complaints/${id}`
        )


      const complaintData =
        await complaintResponse.json()


      if (!complaintResponse.ok) {

        throw new Error(
          complaintData.message ||
          'Complaint not found.'
        )

      }


      setComplaint(
        complaintData
      )


      // ==================================
      // GET HISTORY FROM C++ LINKED LIST
      // ==================================

      const historyResponse =
        await fetch(
          `http://localhost:5000/api/complaints/${id}/history`
        )


      const historyData =
        await historyResponse.json()


      if (!historyResponse.ok) {

        throw new Error(
          historyData.message ||
          'Failed to fetch complaint history.'
        )

      }


      console.log(
        'History received from C++ Linked List:',
        historyData
      )


      setHistory(
        historyData.history || []
      )


    } catch (error) {

      console.error(
        'Tracking error:',
        error
      )


      setError(
        error.message ||
        'Unable to connect to CivicPulse server.'
      )


      setComplaint(null)
      setHistory([])


    } finally {

      setIsSearching(false)

    }

  }


  // ======================================
  // STATUS HELPERS
  // ======================================

  function getStatusClass(status) {

    if (
      status === 'Resolved'
    ) {

      return 'timeline-step completed'

    }


    if (
      status === 'In Progress'
    ) {

      return 'timeline-step active'

    }


    return 'timeline-step active'

  }


  function getStatusIcon(
    status,
    index
  ) {

    if (
      status === 'Resolved'
    ) {

      return '✓'

    }


    if (
      status === 'In Progress'
    ) {

      return '→'

    }


    if (
      index === 0
    ) {

      return '✓'

    }


    return index + 1

  }


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
              value={complaintId}
              onChange={(event) =>
                setComplaintId(
                  event.target.value
                )
              }
            />


            <button
              type="submit"
              className="submit-button"
              disabled={isSearching}
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

            {/* Result Header */}

            <div className="result-header">

              <div>

                <p className="result-label">
                  COMPLAINT FOUND
                </p>


                <h2>
                  {complaint.id}
                </h2>

              </div>


              <span className="status-badge">
                {complaint.status}
              </span>

            </div>


            {/* ==================================
                COMPLAINT DETAILS
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
                  {complaint.priority}
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

                  {complaint.createdAt
                    ? new Date(
                        complaint.createdAt
                      ).toLocaleDateString()
                    : 'Not available'}

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
                LINKED LIST HISTORY
            ================================== */}

            <div className="status-section">

              <div className="history-heading">

                <div>

                  <p className="result-label">
                    C++ LINKED LIST
                  </p>

                  <h3>
                    Complaint History
                  </h3>

                </div>


                <span>
                  {history.length}{' '}
                  {history.length === 1
                    ? 'update'
                    : 'updates'}
                </span>

              </div>


              {history.length === 0 ? (

                <div className="empty-state">
                  No history available.
                </div>

              ) : (

                <div className="timeline">

                  {history.map(
                    (item, index) => (

                      <div
                        className={getStatusClass(
                          item.status
                        )}
                        key={
                          `${item.status}-${index}`
                        }
                      >

                        <div className="timeline-dot">

                          {getStatusIcon(
                            item.status,
                            index
                          )}

                        </div>


                        <div>

                          <strong>
                            {item.status}
                          </strong>


                          <p>
                            {item.description}
                          </p>


                          <small>

                            {item.timestamp
                              ? new Date(
                                  item.timestamp
                                ).toLocaleString()
                              : ''}

                          </small>

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