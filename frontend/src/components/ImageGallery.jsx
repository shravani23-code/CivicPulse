import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'

// Thumbnail grid with a click-to-enlarge lightbox. Used on the complaint
// success page, Track Complaint results, and the admin/citizen details
// modal. Renders a graceful empty state when a complaint has no photos —
// keeps working for complaints submitted before multi-image support.
function ImageGallery({ images = [] }) {

  const [activeIndex, setActiveIndex] = useState(null)

  if (!images || images.length === 0) {

    return (
      <div className="image-gallery-empty">
        <ImageOff size={18} />
        <span>No photos were attached to this complaint.</span>
      </div>
    )

  }

  function openAt(index) {
    setActiveIndex(index)
  }

  function close() {
    setActiveIndex(null)
  }

  function showPrev(event) {
    event.stopPropagation()
    setActiveIndex(current => (current - 1 + images.length) % images.length)
  }

  function showNext(event) {
    event.stopPropagation()
    setActiveIndex(current => (current + 1) % images.length)
  }

  return (
    <div className="image-gallery">

      <div className="image-gallery-grid">

        {images.map((image, index) => (
          <button
            type="button"
            key={image.publicId || image.url || index}
            className="image-gallery-thumb"
            onClick={() => openAt(index)}
            aria-label={`View photo ${index + 1} of ${images.length}`}
          >
            <img src={image.url} alt={`Complaint photo ${index + 1}`} loading="lazy" />
          </button>
        ))}

      </div>

      <AnimatePresence>

        {activeIndex !== null && (

          <motion.div
            className="lightbox-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          >

            <motion.div
              className="lightbox-content"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={event => event.stopPropagation()}
            >

              <button
                type="button"
                className="lightbox-close"
                onClick={close}
                aria-label="Close image viewer"
              >
                <X size={20} />
              </button>

              {images.length > 1 && (
                <button
                  type="button"
                  className="lightbox-nav lightbox-prev"
                  onClick={showPrev}
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <img
                src={images[activeIndex].url}
                alt={`Complaint photo ${activeIndex + 1} of ${images.length}`}
              />

              {images.length > 1 && (
                <button
                  type="button"
                  className="lightbox-nav lightbox-next"
                  onClick={showNext}
                  aria-label="Next photo"
                >
                  <ChevronRight size={22} />
                </button>
              )}

              {images.length > 1 && (
                <div className="lightbox-counter">
                  {activeIndex + 1} / {images.length}
                </div>
              )}

            </motion.div>

          </motion.div>

        )}

      </AnimatePresence>

    </div>
  )
}

export default ImageGallery
