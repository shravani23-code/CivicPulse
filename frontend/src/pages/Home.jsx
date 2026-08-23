import { useEffect, useState } from 'react'
import '../App.css'

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


  useEffect(() => {

    async function fetchStats() {

      try {

        const response =
          await fetch(
            'http://localhost:5000/api/complaints/stats'
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


  return (
    <div className="app">

      {/* Navigation Bar */}
      <nav className="navbar">

        <div className="logo">
          Civic<span>Pulse</span>
        </div>

        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
        </div>

        {/* Admin Dashboard */}
        <a
          href="/admin"
          className="nav-button"
        >
          Admin Dashboard
        </a>

      </nav>


      {/* Hero Section */}
      <section className="hero-section" id="home">

        <div className="hero-content">

          <p className="hero-label">
            SMART CIVIC INTELLIGENCE
          </p>

          <h1>
            Make Your City
            <span> Better Together.</span>
          </h1>

          <p className="hero-description">
            CivicPulse helps citizens report civic problems and helps
            authorities intelligently prioritize, manage and resolve them.
          </p>

          <div className="hero-buttons">

            <a
              href="/report-complaint"
              className="primary-button"
            >
              Report a Complaint
            </a>

            <a
              href="/track-complaint"
              className="secondary-button"
            >
              Track Complaint
            </a>

          </div>

        </div>


        {/* City Status Card */}
        <div className="hero-card">

          <div className="card-header">

            <div>

              <p className="card-small-title">
                LIVE CIVIC OVERVIEW
              </p>

              <h2>
                City Status
              </h2>

            </div>

            <span className="status-dot"></span>

          </div>


          <div className="stats">

            <div className="stat">
              <h3>
                {statsLoading ? '...' : stats.total}
              </h3>

              <p>
                Total Complaints
              </p>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : stats.pending}
              </h3>

              <p>
                Pending
              </p>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : stats.resolved}
              </h3>

              <p>
                Resolved
              </p>
            </div>

            <div className="stat">
              <h3>
                {statsLoading ? '...' : stats.critical}
              </h3>

              <p>
                Critical
              </p>
            </div>

          </div>

        </div>

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
            From complaints to
            <span> meaningful action.</span>
          </h2>

          <p>
            CivicPulse combines Data Structures, Algorithms, AI and
            modern web technologies to make complaint management smarter.
          </p>

        </div>


        <div className="features-grid">

          <div className="feature-card">

            <div className="feature-icon">
              01
            </div>

            <h3>
              Smart Prioritization
            </h3>

            <p>
              Complaints are ranked according to severity, waiting time,
              number of reports and other important factors.
            </p>

          </div>


          <div className="feature-card">

            <div className="feature-icon">
              02
            </div>

            <h3>
              AI Analysis
            </h3>

            <p>
              AI can help classify complaints, understand their severity
              and identify related or duplicate complaints.
            </p>

          </div>


          <div className="feature-card">

            <div className="feature-icon">
              03
            </div>

            <h3>
              Hotspot Detection
            </h3>

            <p>
              Identify areas receiving unusually high numbers of civic
              complaints and highlight them for authorities.
            </p>

          </div>


          <div className="feature-card">

            <div className="feature-icon">
              04
            </div>

            <h3>
              Smart Assignment
            </h3>

            <p>
              Help authorities assign suitable workers and calculate
              efficient routes using graph algorithms.
            </p>

          </div>

        </div>

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
            One complaint.
            <span> Smarter resolution.</span>
          </h2>

        </div>


        <div className="steps">

          <div className="step">

            <span>01</span>

            <h3>
              Report
            </h3>

            <p>
              Citizens submit a civic complaint with details and location.
            </p>

          </div>


          <div className="step">

            <span>02</span>

            <h3>
              Analyze
            </h3>

            <p>
              The system analyzes, categorizes and evaluates the complaint.
            </p>

          </div>


          <div className="step">

            <span>03</span>

            <h3>
              Prioritize
            </h3>

            <p>
              Data Structures and algorithms determine which problems
              require attention first.
            </p>

          </div>


          <div className="step">

            <span>04</span>

            <h3>
              Resolve
            </h3>

            <p>
              Authorities assign workers and track the complaint until
              resolution.
            </p>

          </div>

        </div>

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
          CivicPulse is designed as an intelligent civic management
          platform where Data Structures and Algorithms form the core
          decision-making engine, supported by AI, full-stack development
          and location-based analysis.
        </p>

      </section>


      {/* Footer */}
      <footer className="footer">

        <div className="logo">
          Civic<span>Pulse</span>
        </div>

        <p>
          Intelligent civic complaint management.
        </p>

        <p>
          © 2026 CivicPulse
        </p>

      </footer>

    </div>
  )
}

export default Home