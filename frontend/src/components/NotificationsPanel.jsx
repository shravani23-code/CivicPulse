import { useEffect, useState } from 'react'
import { Bell, BellOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { useAuth } from '../auth/useAuthContext'

// SMS copy states worth showing. "accepted" only means the SMS provider
// took the message — it is never shown as delivered; "delivered" comes
// from the provider's own delivery report.
const SMS_STATUS_LABELS = {
  accepted: 'SMS sent to the provider',
  delivered: 'SMS delivered',
  failed: 'SMS could not be sent'
}

// Citizen's persistent in-app notifications (stored on the backend, so
// they survive refreshes and devices). They are fetched when the page
// opens or Refresh is pressed — there is no live push. Opening a
// notification marks it read and, when it refers to a complaint, asks
// the parent to show it.
function NotificationsPanel({ onOpenComplaint }) {

  const { authRequest } = useAuth()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  function reload() {
    setLoading(true)
    setReloadKey(key => key + 1)
  }

  useEffect(() => {

    let cancelled = false

    async function load() {

      try {

        const data = await authRequest('/api/notifications?limit=30')

        if (cancelled) return

        setError('')
        setActionError('')
        setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
        setUnreadCount(data.unreadCount || 0)

      } catch (fetchError) {

        if (!cancelled) setError(fetchError.message || 'Failed to load notifications.')

      } finally {

        if (!cancelled) setLoading(false)

      }

    }

    load()

    return () => { cancelled = true }

  }, [authRequest, reloadKey])

  async function openNotification(notification) {

    if (!notification.read) {

      // Optimistic update; rolled back if the server rejects it.
      setNotifications(current =>
        current.map(item => item._id === notification._id ? { ...item, read: true } : item)
      )
      setUnreadCount(count => Math.max(count - 1, 0))

      authRequest(`/api/notifications/${notification._id}/read`, { method: 'PATCH' })
        .catch(() => {
          setNotifications(current =>
            current.map(item => item._id === notification._id ? { ...item, read: false } : item)
          )
          setUnreadCount(count => count + 1)
        })

    }

    if (notification.complaintId && onOpenComplaint) {
      onOpenComplaint(notification.complaintId)
    }

  }

  async function markAllRead() {

    if (markingAll) return

    try {

      setMarkingAll(true)
      setActionError('')

      await authRequest('/api/notifications/read-all', { method: 'PATCH' })

      setNotifications(current => current.map(item => ({ ...item, read: true })))
      setUnreadCount(0)

    } catch (markError) {

      setActionError(markError.message || 'Failed to mark notifications as read.')

    } finally {

      setMarkingAll(false)

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

        <div className="card-header-actions">

          {unreadCount > 0 && (
            <button type="button" className="refresh-button" onClick={markAllRead} disabled={markingAll}>
              {markingAll ? 'Updating...' : 'Mark all as read'}
            </button>
          )}

          <button type="button" className="refresh-button" onClick={reload} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

        </div>

      </div>

      {loading && notifications.length === 0 && (
        <div className="panel-status" role="status">
          <RefreshCw size={16} className="spin" aria-hidden="true" />
          Loading notifications...
        </div>
      )}

      {error && !loading && (
        <div className="panel-status error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="link-button" onClick={reload}>Retry</button>
        </div>
      )}

      {actionError && (
        <div className="panel-status error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="panel-status empty">
          <BellOff size={18} aria-hidden="true" />
          <span>
            <strong>No notifications yet.</strong>
            <small>You will be notified here when your complaints are reviewed or their status changes.</small>
          </span>
        </div>
      )}

      {notifications.length > 0 && (

        <ul className="notification-list">

          {visible.map(notification => (

            <li key={notification._id}>

              <button
                type="button"
                className={`notification-item${notification.read ? '' : ' unread'}`}
                onClick={() => openNotification(notification)}
              >

                <span className="notification-item-head">
                  <strong>
                    {!notification.read && <span className="visually-hidden">Unread: </span>}
                    {notification.title}
                  </strong>
                  <time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time>
                </span>

                <span className="notification-item-message">{notification.message}</span>

                {SMS_STATUS_LABELS[notification.smsStatus] && (
                  <span className="notification-sms">{SMS_STATUS_LABELS[notification.smsStatus]}</span>
                )}

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
