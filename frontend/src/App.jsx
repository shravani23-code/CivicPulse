import Home from './pages/Home'
import ReportComplaint from './pages/ReportComplaint'
import TrackComplaint from './pages/TrackComplaint'
import AdminDashboard from './pages/AdminDashboard'

function App() {

  const currentPath = window.location.pathname


  if (currentPath === '/report-complaint') {
    return <ReportComplaint />
  }


  if (currentPath === '/track-complaint') {
    return <TrackComplaint />
  }


  if (currentPath === '/admin') {
    return <AdminDashboard />
  }


  return <Home />
}

export default App