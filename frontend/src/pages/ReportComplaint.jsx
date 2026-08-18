import { useState } from 'react'
import '../App.css'

function ReportComplaint() {

  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    location: '',
    severity: '',
    image: null
  })

  const [submittedComplaint, setSubmittedComplaint] = useState(null)

  const [error, setError] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)


  // Handle text, select and textarea changes
  function handleChange(event) {

    const { name, value } = event.target

    setFormData({
      ...formData,
      [name]: value
    })
  }


  // Handle image selection
  function handleImageChange(event) {

    setFormData({
      ...formData,
      image: event.target.files[0]
    })
  }


  // Submit complaint to backend
  async function handleSubmit(event) {

    event.preventDefault()

    setError('')
    setIsSubmitting(true)

    try {

      const response = await fetch(
        'http://localhost:5000/api/complaints',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            title: formData.title,
            category: formData.category,
            description: formData.description,
            location: formData.location,
            severity: formData.severity
          })
        }
      )


      const data = await response.json()


      if (!response.ok) {

        setError(
          data.message || 'Failed to submit complaint.'
        )

        setIsSubmitting(false)

        return
      }


      console.log(
        'Complaint received from backend:',
        data
      )


      // Backend-generated complaint
      setSubmittedComplaint({
        ...data.complaint,

        imageName: formData.image
          ? formData.image.name
          : 'No image uploaded'
      })

    } catch (error) {

      console.error(
        'Backend connection error:',
        error
      )

      setError(
        'Unable to connect to CivicPulse server. Make sure the backend is running on port 5000.'
      )

    } finally {

      setIsSubmitting(false)
    }
  }


  return (
    <div className="complaint-page">

      {/* Header */}

      <div className="complaint-header">

        <a
          href="/"
          className="back-link"
        >
          ← Back to CivicPulse
        </a>

        <p className="hero-label">
          CIVIC COMPLAINT
        </p>

        <h1>
          Report a <span>Complaint</span>
        </h1>

        <p>
          Help improve your city by reporting a civic problem.
        </p>

      </div>


      {/* Complaint Form */}

      {!submittedComplaint ? (

        <form
          className="complaint-form"
          onSubmit={handleSubmit}
        >

          {/* Complaint Title */}

          <div className="form-group">

            <label>
              Complaint Title
            </label>

            <input
              type="text"
              name="title"
              placeholder="Example: Large pothole on main road"
              value={formData.title}
              onChange={handleChange}
              required
            />

          </div>


          {/* Category + Severity */}

          <div className="form-row">

            <div className="form-group">

              <label>
                Category
              </label>

              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select category
                </option>

                <option value="Road">
                  Road / Pothole
                </option>

                <option value="Garbage">
                  Garbage / Waste
                </option>

                <option value="Water">
                  Water Supply
                </option>

                <option value="Streetlight">
                  Streetlight
                </option>

                <option value="Drainage">
                  Drainage
                </option>

                <option value="Traffic">
                  Traffic
                </option>

                <option value="Other">
                  Other
                </option>

              </select>

            </div>


            <div className="form-group">

              <label>
                Severity
              </label>

              <select
                name="severity"
                value={formData.severity}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select severity
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

          </div>


          {/* Description */}

          <div className="form-group">

            <label>
              Description
            </label>

            <textarea
              name="description"
              placeholder="Describe the problem in detail..."
              value={formData.description}
              onChange={handleChange}
              rows="6"
              required
            ></textarea>

          </div>


          {/* Location */}

          <div className="form-group">

            <label>
              Location
            </label>

            <input
              type="text"
              name="location"
              placeholder="Example: Near PCCOE, Nigdi"
              value={formData.location}
              onChange={handleChange}
              required
            />

          </div>


          {/* Image */}

          <div className="form-group">

            <label>
              Upload Photo
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />

            <small>
              Upload an image showing the civic problem.
            </small>

          </div>


          {/* Error */}

          {error && (

            <div
              style={{
                marginTop: '15px',
                padding: '12px',
                background: '#fff0f0',
                color: '#a33a3a',
                borderRadius: '8px'
              }}
            >
              {error}
            </div>

          )}


          {/* Submit */}

          <button
            type="submit"
            className="submit-button"
            disabled={isSubmitting}
          >

            {isSubmitting
              ? 'Submitting...'
              : 'Submit Complaint'}

          </button>

        </form>

      ) : (

        /* Success Card */

        <div className="success-card">

          <div className="success-icon">
            ✓
          </div>

          <h2>
            Complaint Submitted Successfully
          </h2>

          <p>
            Your complaint has been recorded.
          </p>


          {/* Complaint ID */}

          <div className="complaint-id">

            Complaint ID:

            <strong>
              {submittedComplaint.id}
            </strong>

          </div>


          {/* Submitted Details */}

          <div className="submitted-details">

            <div className="detail-item">
              <span>Title</span>

              <strong>
                {submittedComplaint.title}
              </strong>
            </div>


            <div className="detail-item">
              <span>Category</span>

              <strong>
                {submittedComplaint.category}
              </strong>
            </div>


            <div className="detail-item">
              <span>Severity</span>

              <strong>
                {submittedComplaint.severity}
              </strong>
            </div>


            <div className="detail-item">
              <span>Location</span>

              <strong>
                {submittedComplaint.location}
              </strong>
            </div>


            <div className="detail-item">
              <span>Status</span>

              <strong>
                {submittedComplaint.status}
              </strong>
            </div>


            <div className="detail-item">
              <span>Photo</span>

              <strong>
                {submittedComplaint.imageName}
              </strong>
            </div>

          </div>


          {/* Description */}

          <div className="submitted-description">

            <span>
              Description
            </span>

            <p>
              {submittedComplaint.description}
            </p>

          </div>


          <a
            href="/"
            className="primary-button"
          >
            Back to Home
          </a>

        </div>

      )}

    </div>
  )
}

export default ReportComplaint