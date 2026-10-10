import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { API_BASE_URL } from '../config/api'
import { useAuth } from '../auth/useAuthContext'

// Citizen's persistent in-app notifications (stored on the backend, so
// they survive refreshes and devices). Opening a notification marks it
// read and, when it refers to a complaint, asks the parent to show it.
function NotificationsPanel({ onOpenComplaint }) {

  const { token } = useAuth()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {

    let cancelled = false

    async function load() {

      try {

        const response = await fetch(`${API_BASE_URL}/api/notifications?limit=30`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load notifications.')
        }

        if (cancelled) return

        setError('')
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)

      } catch (fetchError) {

        if (!cancelled) setError(fetchError.message)

      } finally {

        if (!cancelled) setLoading(false)

      }

    }

    load()

    return () => { cancelled = true }

  }, [token])

  async function openNotification(notification) {

    if (!notification.read) {

      // Optimistic update; the server call is idempotent.
      setNotifications(current =>
        current.map(item => item._id === notification._id ? { ...item, read: true } : item)
      )
      setUnreadCount(count => Math.max(count - 1, 0))

      fetch(`${API_BASE_URL}/api/notifications/${notification._id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {})

    }

    if (notification.complaintId && onOpenComplaint) {
      onOpenComplaint(notification.complaintId)
    }

  }

  async function markAllRead() {

    try {

      const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) throw new Error()

      setNotifications(current => current.map(item => ({ ...item, read: true })))
      setUnreadCount(0)

    } catch {

      setError('Failed to mark notifications as read.')

    }

  }

  const visible = expanded ? notifications : notifications.slice(0, 5)

  return (
    <div className="admin-card notifications-card">

      <div className="admin-card-header">

        <div>
          <h2 className="notifications-title">
            <Bell size={22} />
            Notifications
            {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
          </h2>
          <p>Updates about your complaints.</p>
        </div>

        {unreadCount > 0 && (
          <button type="button" className="refresh-button" onClick={markAllRead}>
            Mark all as read
          </button>
        )}

      </div>

      {loading && <div className="admin-message">Loading notifications...</div>}

      {error && <div className="track-error">{error}</div>}

      {!loading && !error && notifications.length === 0 && (
        <div className="empty-state">No notifications yet.</div>
      )}

      {!loading && notifications.length > 0 && (

        <ul className="notification-list">

          {visible.map(notification => (

            <li key={notification._id}>

              <button
                type="button"
                className={`notification-item${notification.read ? '' : ' unread'}`}
                onClick={() => openNotification(notification)}
              >

                <span className="notification-item-head">
                  <strong>{notification.title}</strong>
                  <time>{new Date(notification.createdAt).toLocaleString()}</time>
                </span>

                <span className="notification-item-message">{notification.message}</span>

              </button>

            </li>

          ))}

        </ul>

      )}

      {notifications.length > 5 && (
        <button type="button" className="secondary-button notification-more" onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show fewer' : `Show all ${notifications.length}`}
        </button>
      )}

    </div>
  )

}

export default NotificationsPanel
