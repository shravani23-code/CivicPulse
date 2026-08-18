import { useState } from 'react'
import '../App.css'

function TrackComplaint() {

  const [complaintId, setComplaintId] = useState('')
  const [complaint, setComplaint] = useState(null)
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)


  async function handleSearch(event) {

    event.preventDefault()

    setError('')
    setComplaint(null)

    const id = complaintId.trim()

    if (!id) {
      setError('Please enter a Complaint ID.')
      return
    }

    setIsSearching(true)

    try {

      const response = await fetch(
        `http://localhost:5000/api/complaints/${id}`
      )

      const data = await response.json()

      if (!response.ok) {

        setError(
          data.message || 'Complaint not found.'
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


  return (
    <div className="track-page">

      {/* Header */}

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


      {/* Search Box */}

      <div className="track-card">

        <form onSubmit={handleSearch}>

          <label>
            Complaint ID
          </label>

          <div className="track-input-row">

            <input
              type="text"
              placeholder="Example: CP12345678"
              value={complaintId}
              onChange={(event) =>
                setComplaintId(event.target.value)
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


        {/* Error */}

        {error && (
          <div className="track-error">
            {error}
          </div>
        )}


        {/* Complaint Result */}

        {complaint && (

          <div className="complaint-result">

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
                  {complaint.priority || 'Not calculated'}
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


            {/* Description */}

            <div className="submitted-description">

              <span>
                Description
              </span>

              <p>
                {complaint.description}
              </p>

            </div>


            {/* Status Timeline */}

            <div className="status-section">

              <h3>
                Complaint Progress
              </h3>

              <div className="timeline">

                <div className="timeline-step active">

                  <div className="timeline-dot">
                    ✓
                  </div>

                  <div>

                    <strong>
                      Complaint Submitted
                    </strong>

                    <p>
                      Your complaint has been received.
                    </p>

                  </div>

                </div>


                <div className="timeline-step active">

                  <div className="timeline-dot">
                    ✓
                  </div>

                  <div>

                    <strong>
                      Complaint Analyzed
                    </strong>

                    <p>
                      Complaint category and severity have been recorded.
                    </p>

                  </div>

                </div>


                <div className="timeline-step">

                  <div className="timeline-dot">
                    3
                  </div>

                  <div>

                    <strong>
                      Assigned to Authority
                    </strong>

                    <p>
                      Waiting for assignment.
                    </p>

                  </div>

                </div>


                <div className="timeline-step">

                  <div className="timeline-dot">
                    4
                  </div>

                  <div>

                    <strong>
                      Resolved
                    </strong>

                    <p>
                      The issue will be marked resolved after completion.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  )
}

export default TrackComplaint