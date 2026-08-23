import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Construction,
  Trash2,
  Droplet,
  Lightbulb,
  Waves,
  TrafficCone,
  MoreHorizontal,
  UploadCloud,
  X,
  CheckCircle2
} from 'lucide-react'
import '../App.css'

const CATEGORIES = [
  { value: 'Road', label: 'Road / Pothole', icon: Construction },
  { value: 'Garbage', label: 'Garbage / Waste', icon: Trash2 },
  { value: 'Water', label: 'Water Supply', icon: Droplet },
  { value: 'Streetlight', label: 'Streetlight', icon: Lightbulb },
  { value: 'Drainage', label: 'Drainage', icon: Waves },
  { value: 'Traffic', label: 'Traffic', icon: TrafficCone },
  { value: 'Other', label: 'Other', icon: MoreHorizontal }
]

const SEVERITIES = [
  { value: 'Low', label: 'Low', hint: 'Minor issue, no urgency', color: '#3f7d58' },
  { value: 'Medium', label: 'Medium', hint: 'Should be looked at soon', color: '#c99a2e' },
  { value: 'High', label: 'High', hint: 'Needs prompt attention', color: '#cf7a39' },
  { value: 'Critical', label: 'Critical', hint: 'Urgent, safety risk', color: '#c1503f' }
]

const STEP_LABELS = ['Details', 'Location & Severity', 'Photo', 'Review']

function ReportComplaint() {

  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    location: '',
    severity: '',
    image: null
  })

  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  const [submittedComplaint, setSubmittedComplaint] = useState(null)

  const [error, setError] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const fileInputRef = useRef(null)
  const imagePreviewRef = useRef(null)


  // Handle text, select and textarea changes
  function handleChange(event) {

    const { name, value } = event.target

    setFormData({
      ...formData,
      [name]: value
    })
  }


  function setCategory(value) {
    setFormData(prev => ({ ...prev, category: value }))
  }

  function setSeverity(value) {
    setFormData(prev => ({ ...prev, severity: value }))
  }


  // Set (or clear) the selected image and its preview URL together,
  // revoking the previous object URL to avoid leaking memory.
  function setImageFile(file) {

    if (imagePreviewRef.current) {
      URL.revokeObjectURL(imagePreviewRef.current)
    }

    const url = file ? URL.createObjectURL(file) : null
    imagePreviewRef.current = url

    setFormData(prev => ({ ...prev, image: file }))
    setImagePreview(url)
  }


  // Handle image selection
  function handleImageChange(event) {
    setImageFile(event.target.files[0] || null)
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files && event.dataTransfer.files[0]

    if (file && file.type.startsWith('image/')) {
      setImageFile(file)
    }
  }

  function handleDragOver(event) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function removeImage() {
    setImageFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }


  // Revoke the last object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewRef.current) {
        URL.revokeObjectURL(imagePreviewRef.current)
      }
    }
  }, [])


  function validateStep(currentStep) {

    if (currentStep === 1) {
      if (!formData.title.trim()) return 'Please enter a complaint title.'
      if (!formData.category) return 'Please select a category.'
    }

    if (currentStep === 2) {
      if (!formData.location.trim()) return 'Please enter the location.'
      if (!formData.severity) return 'Please select a severity level.'
      if (!formData.description.trim()) return 'Please describe the problem.'
    }

    return ''
  }

  function goNext() {

    const validationError = validateStep(step)

    if (validationError) {
      setStepError(validationError)
      return
    }

    setStepError('')
    setStep(current => Math.min(current + 1, 4))
  }

  function goBack() {
    setStepError('')
    setStep(current => Math.max(current - 1, 1))
  }


  // Submit complaint to backend
  async function handleSubmit(event) {

    event.preventDefault()

    setError('')
    setIsSubmitting(true)

    try {

      const response = await fetch(
        'https://civicpulse-backend-nt8q.onrender.com/api/complaints',
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


  const selectedCategory = CATEGORIES.find(c => c.value === formData.category)
  const selectedSeverity = SEVERITIES.find(s => s.value === formData.severity)


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

          {/* Step progress indicator */}

          <div className="wizard-progress">

            {STEP_LABELS.map((label, index) => {
              const stepNumber = index + 1
              const isActive = stepNumber === step
              const isDone = stepNumber < step

              return (
                <div className="wizard-step-indicator" key={label}>

                  <div
                    className={`wizard-dot${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
                  >
                    {isDone ? <CheckCircle2 size={14} /> : stepNumber}
                  </div>

                  <span className={isActive ? 'active' : ''}>
                    {label}
                  </span>

                  {index < STEP_LABELS.length - 1 && (
                    <div className="wizard-track">
                      <motion.div
                        className="wizard-track-fill"
                        animate={{ width: isDone ? '100%' : '0%' }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                      />
                    </div>
                  )}

                </div>
              )
            })}

          </div>


          <AnimatePresence mode="wait">

            {step === 1 && (

              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >

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
                  />

                </div>


                <div className="form-group">

                  <label>
                    Category
                  </label>

                  <div className="category-grid">

                    {CATEGORIES.map(cat => {
                      const Icon = cat.icon
                      const active = formData.category === cat.value

                      return (
                        <button
                          type="button"
                          key={cat.value}
                          className={`category-chip${active ? ' active' : ''}`}
                          onClick={() => setCategory(cat.value)}
                        >
                          <Icon size={20} />
                          <span>{cat.label}</span>
                        </button>
                      )
                    })}

                  </div>

                </div>

              </motion.div>

            )}


            {step === 2 && (

              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >

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
                  />

                </div>


                <div className="form-group">

                  <label>
                    Severity
                  </label>

                  <div className="severity-grid">

                    {SEVERITIES.map(sev => {
                      const active = formData.severity === sev.value

                      return (
                        <button
                          type="button"
                          key={sev.value}
                          className={`severity-card${active ? ' active' : ''}`}
                          style={{ '--severity-color': sev.color }}
                          onClick={() => setSeverity(sev.value)}
                        >
                          <strong>{sev.label}</strong>
                          <span>{sev.hint}</span>
                        </button>
                      )
                    })}

                  </div>

                </div>


                <div className="form-group">

                  <label>
                    Description
                  </label>

                  <textarea
                    name="description"
                    placeholder="Describe the problem in detail..."
                    value={formData.description}
                    onChange={handleChange}
                    rows="5"
                  ></textarea>

                </div>

              </motion.div>

            )}


            {step === 3 && (

              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >

                <div className="form-group">

                  <label>
                    Upload Photo
                  </label>

                  {!imagePreview ? (

                    <div
                      className={`dropzone${isDragging ? ' dragging' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >

                      <UploadCloud size={28} />

                      <p>
                        Drag and drop a photo here, or click to browse
                      </p>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />

                    </div>

                  ) : (

                    <div className="image-preview">

                      <img src={imagePreview} alt="Complaint preview" />

                      <button
                        type="button"
                        className="image-remove"
                        onClick={removeImage}
                        aria-label="Remove photo"
                      >
                        <X size={16} />
                      </button>

                    </div>

                  )}

                  <small>
                    Upload an image showing the civic problem. This step is optional.
                  </small>

                </div>

              </motion.div>

            )}


            {step === 4 && (

              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >

                <div className="review-summary">

                  <div className="detail-item">
                    <span>Title</span>
                    <strong>{formData.title}</strong>
                  </div>

                  <div className="detail-item">
                    <span>Category</span>
                    <strong>{selectedCategory ? selectedCategory.label : '—'}</strong>
                  </div>

                  <div className="detail-item">
                    <span>Severity</span>
                    <strong>{selectedSeverity ? selectedSeverity.label : '—'}</strong>
                  </div>

                  <div className="detail-item">
                    <span>Location</span>
                    <strong>{formData.location}</strong>
                  </div>

                  <div className="detail-item">
                    <span>Photo</span>
                    <strong>{formData.image ? formData.image.name : 'No image uploaded'}</strong>
                  </div>

                </div>

                <div className="submitted-description">
                  <span>Description</span>
                  <p>{formData.description}</p>
                </div>

              </motion.div>

            )}

          </AnimatePresence>


          {/* Step error */}

          {stepError && (

            <div
              style={{
                marginTop: '15px',
                padding: '12px',
                background: '#fff0f0',
                color: '#a33a3a',
                borderRadius: '8px'
              }}
            >
              {stepError}
            </div>

          )}


          {/* Submit error */}

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


          {/* Step navigation */}

          <div className="wizard-actions">

            {step > 1 && (
              <button
                type="button"
                className="secondary-button"
                onClick={goBack}
              >
                Back
              </button>
            )}

            {step < 4 && (
              <button
                type="button"
                className="submit-button"
                onClick={goNext}
              >
                Continue
              </button>
            )}

            {step === 4 && (
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Submitting...'
                  : 'Submit Complaint'}
              </button>
            )}

          </div>

        </form>

      ) : (

        /* Success Card */

        <motion.div
          className="success-card"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >

          <motion.div
            className="success-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15, type: 'spring', stiffness: 200 }}
          >
            <CheckCircle2 size={30} />
          </motion.div>

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

        </motion.div>

      )}

    </div>
  )
}

export default ReportComplaint
