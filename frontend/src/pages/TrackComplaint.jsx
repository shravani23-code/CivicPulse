import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link2 } from 'lucide-react'
import '../App.css'

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' }
  }
}

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
          `http://https://civicpulse-backend-nt8q.onrender.com/api/complaints/${id}`
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
          `http://https://civicpulse-backend-nt8q.onrender.com/api/complaints/${id}/history`
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

  function statusToClass(status) {

    if (status === 'Resolved') return 'resolved'
    if (status === 'In Progress') return 'in-progress'

    return 'pending'

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

          <motion.div
            className="complaint-result"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >

            {/* Result Header */}

            <motion.div className="result-header" variants={itemVariants}>

              <div>

                <p className="result-label">
                  COMPLAINT FOUND
                </p>


                <h2>
                  {complaint.id}
                </h2>

              </div>


              <span className={`status-badge ${statusToClass(complaint.status)}`}>
                {complaint.status}
              </span>

            </motion.div>


            {/* ==================================
                COMPLAINT DETAILS
            ================================== */}

            <motion.div className="result-grid" variants={itemVariants}>

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

            </motion.div>


            {/* ==================================
                DESCRIPTION
            ================================== */}

            <motion.div className="submitted-description" variants={itemVariants}>

              <span>
                Description
              </span>

              <p>
                {complaint.description}
              </p>

            </motion.div>


            {/* ==================================
                LINKED LIST HISTORY
            ================================== */}

            <motion.div className="status-section" variants={itemVariants}>

              <div className="history-heading">

                <div>

                  <p className="result-label">
                    <Link2 size={12} style={{ verticalAlign: '-1px', marginRight: '5px' }} />
                    COMPLAINT HISTORY
                  </p>

                  <h3>
                    Complaint History
                  </h3>

                </div>


                <span className="history-count">
                  {history.length}{' '}
                  {history.length === 1
                    ? 'update'
                    : 'updates'}
                </span>

              </div>


              {history.length === 0 ? (

                <div className="history-empty">
                  No history available.
                </div>

              ) : (

                <div className="history-timeline">

                  {history.map(
                    (item, index) => {

                      const isCurrent = index === history.length - 1

                      return (

                        <motion.div
                          className="history-item"
                          key={`${item.status}-${index}`}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.35, delay: index * 0.1 }}
                        >

                          {index < history.length - 1 && (
                            <div className="history-line"></div>
                          )}

                          <div
                            className={`history-node ${statusToClass(item.status)}${isCurrent ? ' current' : ''}`}
                          >

                            {getStatusIcon(
                              item.status,
                              index
                            )}

                          </div>


                          <div className="history-content">

                            <div className="history-top">

                              <strong>
                                {item.status}
                              </strong>

                              <span>

                                {item.timestamp
                                  ? new Date(
                                      item.timestamp
                                    ).toLocaleString()
                                  : ''}

                              </span>

                            </div>


                            <p>
                              {item.description}
                            </p>

                          </div>

                        </motion.div>

                      )
                    }
                  )}

                </div>

              )}

            </motion.div>

          </motion.div>

        )}

      </div>

    </div>

  )

}

export default TrackComplaint
