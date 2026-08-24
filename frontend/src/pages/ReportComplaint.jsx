import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
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
  CheckCircle2,
  Navigation,
  Loader2
} from 'lucide-react'
import '../App.css'
import { API_BASE_URL } from '../config/api'
import { useAuth } from '../auth/useAuthContext'
import CopyButton from '../components/CopyButton'
import ImageGallery from '../components/ImageGallery'

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

const STEP_LABELS = ['Details', 'Location & Severity', 'Photos', 'Review']

const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function ReportComplaint() {

  const { token } = useAuth()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    location: '',
    severity: '',
    images: [],
    latitude: null,
    longitude: null
  })

  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState('')
  const [imagePreviews, setImagePreviews] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [imageError, setImageError] = useState('')

  const [locationStatus, setLocationStatus] = useState('idle') // idle | locating | success | error
  const [locationError, setLocationError] = useState('')

  const [submittedComplaint, setSubmittedComplaint] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fileInputRef = useRef(null)


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


  // Add one or more image files, validating type/size and the 5-image cap.
  function addImages(fileList) {

    setImageError('')

    const incoming = Array.from(fileList || [])

    if (incoming.length === 0) return

    const accepted = []

    for (const file of incoming) {

      if (formData.images.length + accepted.length >= MAX_IMAGES) {
        setImageError(`You can attach up to ${MAX_IMAGES} photos.`)
        break
      }

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError('Only JPEG, PNG, WEBP or GIF images are allowed.')
        continue
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setImageError('Each photo must be 5MB or smaller.')
        continue
      }

      accepted.push(file)

    }

    if (accepted.length === 0) return

    setFormData(prev => ({ ...prev, images: [...prev.images, ...accepted] }))

    setImagePreviews(prev => [
      ...prev,
      ...accepted.map(file => URL.createObjectURL(file))
    ])

  }

  function handleImageChange(event) {
    addImages(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    addImages(event.dataTransfer.files)
  }

  function handleDragOver(event) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function removeImageAt(index) {

    URL.revokeObjectURL(imagePreviews[index])

    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))

    setImagePreviews(prev => prev.filter((_, i) => i !== index))

  }


  // Revoke all preview object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // ======================================
  // LIVE LOCATION
  // ======================================

  function handleUseCurrentLocation() {

    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationError('Geolocation is not supported by this browser. Please enter the location manually.')
      return
    }

    setLocationStatus('locating')
    setLocationError('')

    navigator.geolocation.getCurrentPosition(

      async (position) => {

        const { latitude, longitude } = position.coords

        setFormData(prev => ({ ...prev, latitude, longitude }))
        setLocationStatus('success')

        try {

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          )

          const data = await response.json()

          if (data && data.display_name) {
            setFormData(prev => ({ ...prev, location: data.display_name }))
          }

        } catch {
          // Coordinates were still captured — reverse geocoding is a nice-to-have.
        }

      },

      (geoError) => {

        setLocationStatus('error')

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationError('Location permission denied. You can still enter the location manually below.')
        } else {
          setLocationError('Could not determine your location. Please enter it manually below.')
        }

      },

      { enableHighAccuracy: true, timeout: 10000 }
    )

  }


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

      const body = new FormData()

      body.append('title', formData.title)
      body.append('category', formData.category)
      body.append('description', formData.description)
      body.append('location', formData.location)
      body.append('severity', formData.severity)

      if (formData.latitude !== null) body.append('latitude', formData.latitude)
      if (formData.longitude !== null) body.append('longitude', formData.longitude)

      formData.images.forEach(file => body.append('images', file))

      const response = await fetch(
        `${API_BASE_URL}/api/complaints`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body
        }
      )

      const data = await response.json()

      if (!response.ok) {

        if (response.status === 401) {
          toast.error('Your session has expired. Please log in again.')
          navigate('/login', { state: { from: '/report-complaint' } })
          return
        }

        setError(
          data.message || 'Failed to submit complaint.'
        )

        setIsSubmitting(false)

        return
      }

      setSubmittedComplaint(data.complaint)

    } catch {

      setError(
        'Unable to connect to CivicPulse server. Please check your internet connection and try again.'
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

        <Link to="/" className="back-link">
          ← Back to CivicPulse
        </Link>

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

                  <div className="location-input-row">

                    <input
                      type="text"
                      name="location"
                      placeholder="Example: Near PCCOE, Nigdi"
                      value={formData.location}
                      onChange={handleChange}
                    />

                    <button
                      type="button"
                      className="location-button"
                      onClick={handleUseCurrentLocation}
                      disabled={locationStatus === 'locating'}
                    >
                      {locationStatus === 'locating'
                        ? <Loader2 size={16} className="spin" />
                        : <Navigation size={16} />}
                      Use My Current Location
                    </button>

                  </div>

                  {locationStatus === 'success' && (
                    <small className="location-hint success">
                      Location captured ({formData.latitude.toFixed(5)}, {formData.longitude.toFixed(5)}). You can still edit the text above.
                    </small>
                  )}

                  {locationStatus === 'error' && (
                    <small className="location-hint error">{locationError}</small>
                  )}

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
                    Upload Photos
                  </label>

                  {formData.images.length < MAX_IMAGES && (

                    <div
                      className={`dropzone${isDragging ? ' dragging' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >

                      <UploadCloud size={28} />

                      <p>
                        Drag and drop photos here, or click to browse ({formData.images.length}/{MAX_IMAGES})
                      </p>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />

                    </div>

                  )}

                  {imageError && (
                    <small className="location-hint error">{imageError}</small>
                  )}

                  {imagePreviews.length > 0 && (

                    <div className="image-preview-grid">

                      {imagePreviews.map((preview, index) => (

                        <div className="image-preview" key={preview}>

                          <img src={preview} alt={`Selected photo ${index + 1}`} />

                          <button
                            type="button"
                            className="image-remove"
                            onClick={() => removeImageAt(index)}
                            aria-label={`Remove photo ${index + 1}`}
                          >
                            <X size={16} />
                          </button>

                        </div>

                      ))}

                    </div>

                  )}

                  <small>
                    Upload up to {MAX_IMAGES} images showing the civic problem. This step is optional.
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
                    <span>Photos</span>
                    <strong>
                      {formData.images.length > 0
                        ? `${formData.images.length} photo${formData.images.length > 1 ? 's' : ''} attached`
                        : 'No photos uploaded'}
                    </strong>
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

            <CopyButton value={submittedComplaint.id} />

          </div>

          <p className="success-tracking-hint">
            You can track this anytime from <Link to="/dashboard">My Complaints</Link> or on the{' '}
            <Link to="/track-complaint">Track Complaint</Link> page using this Complaint ID.
          </p>


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


          {/* Photos */}

          <div className="submitted-description">
            <span>Photos</span>
            <ImageGallery images={submittedComplaint.images} />
          </div>


          <Link
            to="/"
            className="primary-button"
          >
            Back to Home
          </Link>

        </motion.div>

      )}

    </div>
  )
}

export default ReportComplaint
