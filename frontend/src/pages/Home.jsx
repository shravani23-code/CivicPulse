import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Menu,
  X,
  FileEdit,
  Search,
  ArrowUpNarrowWide,
  CheckCircle2
} from 'lucide-react'
import '../App.css'
import SmartCity3D from '../components/SmartCity3D'
import { useCountUp } from '../hooks/useCountUp'

const NAV_SECTIONS = ['home', 'features', 'how-it-works', 'about']

const heroContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 }
  }
}

const heroItemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
  }
}

const revealContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 }
  }
}

const revealItemVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' }
  }
}

const HOW_IT_WORKS_STEPS = [
  {
    icon: FileEdit,
    title: 'Report',
    text: 'Submit a civic issue with its location, category, description and supporting photo.'
  },
  {
    icon: Search,
    title: 'Review',
    text: 'Your complaint is categorized and assessed based on its urgency and importance.'
  },
  {
    icon: ArrowUpNarrowWide,
    title: 'Prioritize',
    text: 'Complaints requiring immediate attention are moved ahead based on priority.'
  },
  {
    icon: CheckCircle2,
    title: 'Resolve',
    text: 'Authorities take action, update the status, and keep you informed until the issue is resolved.'
  }
]

function Home() {

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0
  })

  const [statsLoading, setStatsLoading] =
    useState(true)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('home')

  const countedTotal = useCountUp(stats.total)
  const countedPending = useCountUp(stats.pending)
  const countedResolved = useCountUp(stats.resolved)
  const countedCritical = useCountUp(stats.critical)


  useEffect(() => {

    async function fetchStats() {

      try {

        const response =
          await fetch(
            'https://civicpulse-backend-nt8q.onrender.com/api/complaints/stats'
          )


        const data =
          await response.json()


        if (!response.ok) {

          throw new Error(
            data.message ||
            'Failed to fetch statistics.'
          )

        }


        setStats(data)

      } catch (error) {

        console.error(
          'Statistics fetch error:',
          error
        )

      } finally {

        setStatsLoading(false)

      }

    }


    fetchStats()

  }, [])


  // Sticky navbar shadow after scrolling past the top of the hero
  useEffect(() => {

    function handleScroll() {
      setScrolled(window.scrollY > 40)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)

  }, [])


  // Active-section highlighting in the nav while scrolling
  useEffect(() => {

    const sections = NAV_SECTIONS
      .map(id => document.getElementById(id))
      .filter(Boolean)

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
    )

    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()

  }, [])


  const pendingPercent = stats.total
    ? Math.round((stats.pending / stats.total) * 100)
    : 0

  const resolvedPercent = stats.total
    ? Math.round((stats.resolved / stats.total) * 100)
    : 0

  const criticalPercent = stats.total
    ? Math.round((stats.critical / stats.total) * 100)
    : 0

  const isBusy = stats.pending > stats.resolved


  return (
    <div className="app">

      {/* Navigation Bar */}
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>

        <div className="logo">
          Civic<span>Pulse</span>
        </div>

        <div className="nav-links">
          <a
            href="#home"
            className={activeSection === 'home' ? 'active' : ''}
          >
            Home
          </a>
          <a
            href="#features"
            className={activeSection === 'features' ? 'active' : ''}
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className={activeSection === 'how-it-works' ? 'active' : ''}
          >
            How It Works
          </a>
          <a
            href="#about"
            className={activeSection === 'about' ? 'active' : ''}
          >
            About
          </a>
        </div>

        <div className="nav-right">

          {/* Admin Dashboard */}
          <a
            href="/admin"
            className="nav-button"
          >
            Admin Dashboard
          </a>

          <button
            type="button"
            className="nav-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileMenuOpen(open => !open)}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

        </div>

        {mobileMenuOpen && (
          <div className="nav-mobile-panel">
            <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
            <a href="/admin" className="nav-button">Admin Dashboard</a>
          </div>
        )}

      </nav>


      {/* Hero Section */}
      <section className="hero-section" id="home">

        <SmartCity3D />

        <motion.div
          className="hero-content"
          variants={heroContainerVariants}
          initial="hidden"
          animate="visible"
        >

          <motion.p className="hero-label" variants={heroItemVariants}>
            SMART CIVIC INTELLIGENCE
          </motion.p>

          <motion.h1 variants={heroItemVariants}>
            Report problems.<br />
            Track progress.<br />
            <span>Improve your city.</span>
          </motion.h1>

          <motion.p className="hero-description" variants={heroItemVariants}>
            See something that needs attention? Report it to the right
            authority and follow its progress until it&apos;s resolved.
          </motion.p>

          <motion.div className="hero-buttons" variants={heroItemVariants}>

            <motion.a
              href="/report-complaint"
              className="primary-button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Report an Issue
            </motion.a>

            <motion.a
              href="/track-complaint"
              className="secondary-button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Track Complaint
            </motion.a>

          </motion.div>

        </motion.div>


        {/* City Status Card */}
        <motion.div
          className="hero-card"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        >

          <div className="card-header">

            <div>

              <p className="card-small-title">
                LIVE CIVIC OVERVIEW
              </p>

              <h2>
                City Status
              </h2>

            </div>

            <span className={`status-dot${isBusy ? ' busy' : ''}`}></span>

          </div>


          <div className="stats">

            <div className="stat">
              <h3>
                {statsLoading ? '...' : countedTotal}
              </h3>

              <p>
                Total Complaints
              </p>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : countedPending}
              </h3>

              <p>
                Pending
              </p>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill pending"
                  style={{ width: `${statsLoading ? 0 : pendingPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : countedResolved}
              </h3>

              <p>
                Resolved
              </p>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill resolved"
                  style={{ width: `${statsLoading ? 0 : resolvedPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : countedCritical}
              </h3>

              <p>
                Critical
              </p>

              <div className="stat-bar">
                <div
                  className="stat-bar-fill critical"
                  style={{ width: `${statsLoading ? 0 : criticalPercent}%` }}
                ></div>
              </div>
            </div>

          </div>

        </motion.div>

      </section>


      {/* Features Section */}
      <section
        className="features-section"
        id="features"
      >

        <div className="section-heading">

          <p className="hero-label">
            WHAT CIVICPULSE DOES
          </p>

          <h2>
            Making civic problem-solving
            <span> simpler.</span>
          </h2>

          <p>
            CivicPulse makes it easier for citizens to report local issues,
            track their complaints, and stay informed as action is taken.
          </p>

        </div>


        <motion.div
          className="features-grid"
          variants={revealContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >

          <motion.div className="feature-card" variants={revealItemVariants}>

            <div className="feature-icon">
              01
            </div>

            <h3>
              Smart Prioritization
            </h3>

            <p>
              Urgent and high-impact complaints are identified so important
              issues can receive attention sooner.
            </p>

          </motion.div>


          <motion.div className="feature-card" variants={revealItemVariants}>

            <div className="feature-icon">
              02
            </div>

            <h3>
              Clear Complaint Tracking
            </h3>

            <p>
              Follow your complaint from submission to resolution with
              status updates at every stage.
            </p>

          </motion.div>


          <motion.div className="feature-card" variants={revealItemVariants}>

            <div className="feature-icon">
              03
            </div>

            <h3>
              Community Issue Insights
            </h3>

            <p>
              Identify areas where civic problems occur frequently and help
              authorities understand local needs.
            </p>

          </motion.div>


          <motion.div className="feature-card" variants={revealItemVariants}>

            <div className="feature-icon">
              04
            </div>

            <h3>
              Faster Resolution
            </h3>

            <p>
              Help authorities organize, assign and manage complaints
              efficiently until they are resolved.
            </p>

          </motion.div>

        </motion.div>

      </section>


      {/* How It Works Section */}
      <section
        className="how-section"
        id="how-it-works"
      >

        <div className="section-heading">

          <p className="hero-label">
            HOW IT WORKS
          </p>

          <h2>
            One report.
            <span> From submission to resolution.</span>
          </h2>

        </div>


        <motion.div
          className="steps"
          variants={revealContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >

          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const Icon = step.icon

            return (
              <motion.div
                className="step"
                key={step.title}
                variants={revealItemVariants}
              >

                <div className="step-icon">
                  <Icon size={20} />
                </div>

                <span>
                  {String(index + 1).padStart(2, '0')}
                </span>

                <h3>
                  {step.title}
                </h3>

                <p>
                  {step.text}
                </p>

              </motion.div>
            )
          })}

        </motion.div>

      </section>


      {/* About Section */}
      <section
        className="about-section"
        id="about"
      >

        <div>

          <p className="hero-label">
            ABOUT CIVICPULSE
          </p>

          <h2>
            Technology for
            <span> better cities.</span>
          </h2>

        </div>


        <p>
          CivicPulse connects citizens and authorities through a simple and
          transparent complaint management system. Citizens can report
          local issues, track their progress and receive updates, while
          authorities can prioritize, manage and resolve complaints
          efficiently.
        </p>

      </section>


      {/* Footer */}
      <footer className="footer">

        <div className="footer-main">

          <div className="footer-brand">

            <div className="logo">
              Civic<span>Pulse</span>
            </div>

            <p>
              Intelligent civic complaint management.
            </p>

            <p className="footer-tagline">
              Technology for better cities.
            </p>

          </div>

          <nav className="footer-nav" aria-label="Footer">
            <a href="/">Home</a>
            <a href="/report-complaint">Report a Complaint</a>
            <a href="/track-complaint">Track Complaint</a>
            <a href="/admin">Admin Dashboard</a>
          </nav>

        </div>

        <p className="footer-copyright">
          © 2026 CivicPulse
        </p>

      </footer>

    </div>
  )
}

export default Home
