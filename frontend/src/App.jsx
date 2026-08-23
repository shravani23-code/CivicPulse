import { lazy, Suspense } from 'react'
import Home from './pages/Home'
import ReportComplaint from './pages/ReportComplaint'
import TrackComplaint from './pages/TrackComplaint'

// AdminDashboard pulls in the charting library, so it's split into its
// own chunk and only downloaded when someone actually visits /admin.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

function App() {

  const currentPath = window.location.pathname


  if (currentPath === '/report-complaint') {
    return <ReportComplaint />
  }


  if (currentPath === '/track-complaint') {
    return <TrackComplaint />
  }


  if (currentPath === '/admin') {
    return (
      <Suspense fallback={<div className="admin-page">Loading dashboard...</div>}>
        <AdminDashboard />
      </Suspense>
    )
  }


  return <Home />
}

export default App